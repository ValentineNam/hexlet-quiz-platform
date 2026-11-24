#!/usr/bin/env python3
"""Bounded local PM04 diagnostics. Own disposable DB only; no business code changes."""
import argparse
import concurrent.futures
import http.client
import json
import math
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', required=True, help='Actual reporting date YYYY-MM-DD')
    parser.add_argument('--requests', type=int, choices=range(5, 101), default=50)
    parser.add_argument('--repeats', type=int, choices=range(1, 4), default=3)
    parser.add_argument('--output', default='docs/practice/PM04/evidence')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    output = (repo / args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    logpath = output / '007-checks.txt'
    password = secrets.token_hex(24)
    name = 'quiz007-' + secrets.token_hex(5)
    env = os.environ.copy()
    # Never inherit the user's real database or API configuration.
    for key in ('DATABASE_URL', 'TEST_DATABASE_URL', 'ENABLE_QUIZ_API', 'PORT'):
        env.pop(key, None)
    env['POSTGRES_PASSWORD'] = password
    processes, handles = [], []
    created = False
    stop_samples = threading.Event()
    samplers = []
    local = threading.local()
    connections = []
    connection_lock = threading.Lock()
    result = {'date': args.date, 'head': subprocess.check_output(
        ['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip(),
        'requests_per_cell_repeat': args.requests, 'repeats': args.repeats,
        'concurrency': [1, 4], 'warmup_per_method': 10,
        'http': [], 'startup': [], 'performance': [], 'resources': {'api': [], 'postgres': []}}

    def log(message):
        message = str(message).replace(password, '<REDACTED>').replace(str(Path.home()), '<HOME>')
        with logpath.open('a') as handle:
            handle.write(message + '\n')
        print(message, flush=True)

    def run(command, check=True, extra_env=None):
        completed = subprocess.run(command, cwd=repo, env=extra_env or env,
                                   capture_output=True, text=True, timeout=45)
        log('$ ' + ' '.join(command) + '\n' + completed.stdout + completed.stderr +
            'exit=' + str(completed.returncode))
        if check and completed.returncode:
            raise RuntimeError('Command failed: ' + command[0])
        return completed

    def free_port():
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            return sock.getsockname()[1]

    def start(command, cwd, custom_env):
        handle = tempfile.TemporaryFile(mode='w+t')
        handles.append(handle)
        process = subprocess.Popen(command, cwd=cwd, env=custom_env, stdout=handle, stderr=subprocess.STDOUT)
        processes.append(process)
        return process

    def pg_ready():
        for _ in range(50):
            probe = subprocess.run(['docker', 'exec', name, 'pg_isready', '-U', 'quiz007', '-d', 'quiz007_test'],
                                   capture_output=True, text=True, timeout=4)
            if probe.returncode == 0:
                return
            time.sleep(.2)
        raise RuntimeError('Disposable PostgreSQL did not become ready')

    def request(method, path, body=None):
        started = time.perf_counter_ns()
        if not hasattr(local, 'connection'):
            local.connection = http.client.HTTPConnection('127.0.0.1', apiport, timeout=8)
            with connection_lock:
                connections.append(local.connection)
        try:
            local.connection.request(method, path, body=body, headers={
                'Content-Type': 'application/json', 'Accept': 'application/json'})
            response = local.connection.getresponse()
            data = response.read().decode('utf-8')
            status = response.status
        except (OSError, http.client.HTTPException):
            local.connection.close()
            del local.connection
            status, data = 0, 'transport_error'
        return status, data, (time.perf_counter_ns() - started) / 1_000_000

    def no_secrets(body):
        # Check known credential and diagnostic markers without printing the input/URL.
        assert password not in body
        for word in ('PrismaClient', 'DATABASE_URL', 'postgresql://', 'query engine', 'stack'):
            assert word not in body, word

    def probe(label, method, path, body=None, expected=None):
        status, data, elapsed = request(method, path, body)
        no_secrets(data)
        item = {'label': label, 'status': status, 'elapsed_ms': elapsed, 'body': data}
        result['http'].append(item)
        log('HTTP ' + label + ': ' + json.dumps(item, ensure_ascii=False))
        if expected is not None:
            assert status == expected, (label, status, expected)
        return status, data

    def startup_case(label, changes):
        test_env = env.copy()
        test_env['ENABLE_QUIZ_API'] = 'true'
        test_env.update(changes)
        if changes.get('DATABASE_URL') is None:
            test_env.pop('DATABASE_URL', None)
        completed = subprocess.run(['node', 'dist/main.js'], cwd=repo / 'apps/api', env=test_env,
                                   capture_output=True, text=True, timeout=15)
        text = completed.stdout + completed.stderr
        assert password not in text
        assert 'postgresql://' not in text
        item = {'label': label, 'exit': completed.returncode,
                'output': text.replace(str(Path.home()), '<HOME>')}
        result['startup'].append(item)
        log('STARTUP ' + json.dumps(item, ensure_ascii=False))
        assert completed.returncode != 0

    def api_sampler(pid):
        while not stop_samples.is_set():
            sampled = subprocess.run(['ps', '-p', str(pid), '-o', '%cpu=,rss='],
                                     capture_output=True, text=True, timeout=3)
            values = sampled.stdout.split()
            if len(values) == 2:
                result['resources']['api'].append({'offset_s': time.perf_counter() - sample_start,
                                                  'cpu_percent_ps': float(values[0]), 'rss_kib': int(values[1])})
            stop_samples.wait(.25)

    def pg_sampler():
        while not stop_samples.is_set():
            sampled = subprocess.run(['docker', 'stats', '--no-stream', '--format', '{{json .}}', name],
                                     capture_output=True, text=True, timeout=8)
            if sampled.returncode == 0:
                data = json.loads(sampled.stdout)
                result['resources']['postgres'].append({'offset_s': time.perf_counter() - sample_start,
                                                        'cpu_percent': data['CPUPerc'],
                                                        'memory_usage_limit': data['MemUsage']})
            stop_samples.wait(.25)

    def performance(method, repeat, concurrency):
        def one(_):
            status, data, elapsed = request(method, '/quizzes' if method == 'POST' else '/quizzes/' + quizid,
                                           payload if method == 'POST' else None)
            expected = 201 if method == 'POST' else 200
            success = status == expected
            if success:
                success = 'isCorrect' not in data
            return success, status, elapsed
        began = time.perf_counter()
        if concurrency == 1:
            rows = [one(i) for i in range(args.requests)]
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
                rows = list(pool.map(one, range(args.requests)))
        duration = time.perf_counter() - began
        latencies = sorted(row[2] for row in rows)
        def percentile(fraction):
            return latencies[math.ceil(len(latencies) * fraction) - 1]
        item = {'method': method, 'repeat': repeat, 'concurrency': concurrency,
                'requests': len(rows), 'success': sum(row[0] for row in rows),
                'errors': sum(not row[0] for row in rows),
                'p50_ms': percentile(.50), 'p95_ms': percentile(.95), 'max_ms': max(latencies),
                'wall_s': duration, 'throughput_rps': len(rows) / duration,
                'status_counts': {str(code): sum(row[1] == code for row in rows)
                                  for code in sorted({row[1] for row in rows})},
                'latencies_ms': [row[2] for row in rows]}
        result['performance'].append(item)
        log('PERF ' + json.dumps({key: value for key, value in item.items() if key != 'latencies_ms'}))

    log(args.date + ' Europe/Moscow. PM04 baseline: disposable container only, bounded HTTP load. '
        'Client report date supplied explicitly; durations use perf_counter_ns.')
    try:
        startup_case('PORT=abc', {'PORT': 'abc', 'ENABLE_QUIZ_API': 'false'})
        for invalid in ('0', '65536', '3000.5'):
            startup_case('PORT=' + invalid, {'PORT': invalid, 'ENABLE_QUIZ_API': 'false'})
        startup_case('missing DATABASE_URL', {'PORT': str(free_port()), 'DATABASE_URL': None})
        startup_case('invalid DATABASE_URL protocol', {'PORT': str(free_port()), 'DATABASE_URL': 'mysql://localhost/invalid_test'})
        startup_case('unavailable PostgreSQL at startup', {'PORT': str(free_port()),
                     'DATABASE_URL': f'postgresql://quiz007:{password}@127.0.0.1:{free_port()}/quiz007_test?connect_timeout=1'})
        fixed_dbport = free_port()
        run(['docker', 'run', '-d', '--name', name, '--label', 'quiz-diagnostics=007',
             '--memory=512m', '--cpus=2', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=quiz007_test',
             '-e', 'POSTGRES_USER=quiz007', '-p', f'127.0.0.1:{fixed_dbport}:5432', 'postgres:17.6-alpine'])
        created = True
        pg_ready()
        binding = run(['docker', 'port', name, '5432/tcp']).stdout.strip()
        dbport = binding.rsplit(':', 1)[1]
        env['DATABASE_URL'] = f'postgresql://quiz007:{password}@127.0.0.1:{dbport}/quiz007_test?schema=public&connect_timeout=1&pool_timeout=2'
        env['TEST_DATABASE_URL'] = env['DATABASE_URL']
        for command in (['pnpm', '--filter', '@quiz/api', 'db:validate'],
                        ['pnpm', '--filter', '@quiz/api', 'db:migrate'],
                        ['pnpm', '--filter', '@quiz/api', 'exec', 'prisma', 'migrate', 'status'],
                        ['pnpm', '--filter', '@quiz/api', 'db:migrate'],
                        ['pnpm', '--filter', '@quiz/api', 'test:integration']):
            run(command)
        result['postgres_version'] = run(['docker', 'exec', name, 'psql', '-U', 'quiz007', '-d', 'quiz007_test', '-Atc', 'SELECT version();']).stdout.strip()
        apiport = free_port()
        env['PORT'] = str(apiport)
        # No flag, no DATABASE_URL: only health, no routes or connection.
        disabled_env = env.copy()
        disabled_env.pop('ENABLE_QUIZ_API', None)
        disabled_env.pop('DATABASE_URL', None)
        disabled = start(['node', 'dist/main.js'], repo / 'apps/api', disabled_env)
        for _ in range(100):
            if request('GET', '/health')[0] == 200:
                break
            time.sleep(.1)
        else:
            raise RuntimeError('Disabled API not ready')
        probe('default flag health', 'GET', '/health', expected=200)
        probe('default flag quiz route absent', 'GET', '/quizzes/123e4567-e89b-42d3-a456-426614174000', expected=404)
        disabled.terminate()
        disabled.wait(timeout=10)
        # Drop stale connections when the owned API instance changes.
        for connection in connections:
            connection.close()
        local = threading.local()
        env['ENABLE_QUIZ_API'] = 'true'
        api = start(['node', 'dist/main.js'], repo / 'apps/api', env)
        for _ in range(100):
            if request('GET', '/health')[0] == 200:
                break
            time.sleep(.1)
        else:
            raise RuntimeError('Enabled API not ready')
        run(['lsof', '-nP', '-a', '-p', str(api.pid), '-iTCP', '-sTCP:LISTEN'])
        result['api_bind'] = '127.0.0.1:' + str(apiport)
        result['database_bind'] = binding
        data = {'title': 'PM04 synthetic baseline', 'description': 'Synthetic data, no user records',
                'questions': [{'type': kind, 'text': 'Synthetic question ' + kind,
                               'timeLimitSeconds': 30, 'maxPoints': 1000,
                               'options': [{'id': str(i), 'text': 'Option ' + str(i),
                                            'isCorrect': i < (1 if kind == 'single' else 2)} for i in range(4)]}
                              for kind in ('single', 'multiple')]}
        payload = json.dumps(data).encode()
        result['payload_bytes'] = len(payload)
        _, body = probe('POST valid', 'POST', '/quizzes', payload, 201)
        dto = json.loads(body)
        quizid = dto['id']
        assert 'isCorrect' not in body
        _, fetched = probe('GET saved', 'GET', '/quizzes/' + quizid, expected=200)
        assert json.loads(fetched) == dto
        probe('invalid UUID', 'GET', '/quizzes/not-a-uuid', expected=400)
        probe('missing quiz', 'GET', '/quizzes/123e4567-e89b-42d3-a456-426614174000', expected=404)
        probe('malformed JSON', 'POST', '/quizzes', b'{"title":', 400)
        probe('oversized JSON', 'POST', '/quizzes', json.dumps({'title': 'x' * (110 * 1024)}).encode(), 413)
        bad = json.loads(payload)
        bad['questions'][0]['timeLimitSeconds'] = 4
        _, invalid = probe('structured validation', 'POST', '/quizzes', json.dumps(bad).encode(), 400)
        errors = json.loads(invalid)
        assert errors['code'] == 'INVALID_QUIZ'
        assert errors['errors'][0]['field'] == 'questions[0].timeLimitSeconds'
        # Vite startup/proxy smoke, no browser or workload through dev server.
        webport = free_port()
        webenv = env.copy()
        webenv['QUIZ_API_PORT'] = str(apiport)
        for key in ('DATABASE_URL', 'TEST_DATABASE_URL', 'POSTGRES_PASSWORD'):
            webenv.pop(key, None)
        web = start(['node', str(repo / 'apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', str(webport)], repo / 'apps/web', webenv)
        for _ in range(100):
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{webport}', timeout=1) as response:
                    assert response.status == 200
                break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError('Vite did not start')
        with urllib.request.urlopen(f'http://127.0.0.1:{webport}/api/quizzes/{quizid}', timeout=4) as response:
            assert response.status == 200
            assert json.load(response) == dto
        log('Vite startup GET / = 200, proxy GET /api/quizzes/:id = 200; no database credentials passed to Vite.')
        web.terminate()
        web.wait(timeout=10)
        for method in ('GET', 'POST'):
            for _ in range(10):
                status, _, _ = request(method, '/quizzes' if method == 'POST' else '/quizzes/' + quizid,
                                       payload if method == 'POST' else None)
                assert status == (201 if method == 'POST' else 200)
        log('Warmup: 10 GET + 10 POST, all successful, excluded from performance rows.')
        sample_start = time.perf_counter()
        for function, params in ((api_sampler, (api.pid,)), (pg_sampler, ())):
            thread = threading.Thread(target=function, args=params, daemon=True)
            samplers.append(thread)
            thread.start()
        for repeat in range(1, args.repeats + 1):
            for method in ('GET', 'POST'):
                for concurrency in (1, 4):
                    performance(method, repeat, concurrency)
        stop_samples.set()
        for thread in samplers:
            thread.join(timeout=10)
        log('RESOURCE samples API=' + str(len(result['resources']['api'])) +
            ' PostgreSQL=' + str(len(result['resources']['postgres'])))
        run(['docker', 'stop', '--timeout', '2', name])
        probe('GET while DB stopped', 'GET', '/quizzes/' + quizid, expected=503)
        probe('POST while DB stopped', 'POST', '/quizzes', payload, 503)
        probe('health while DB stopped', 'GET', '/health', expected=200)
        recovery = time.perf_counter()
        run(['docker', 'start', name])
        pg_ready()
        restarted_binding = run(['docker', 'port', name, '5432/tcp']).stdout.strip()
        assert restarted_binding == binding, 'Database port changed during recovery'
        result['recovery_attempts'] = []
        deadline = time.perf_counter() + 30
        while time.perf_counter() < deadline:
            status, recovered, _ = request('GET', '/quizzes/' + quizid)
            result['recovery_attempts'].append(status)
            if status == 200:
                break
            time.sleep(.2)
        assert status == 200, str(result['recovery_attempts'])
        assert json.loads(recovered) == dto
        result['recovery_seconds'] = time.perf_counter() - recovery
        result['same_api_process_after_recovery'] = api.poll() is None
        probe('POST after DB recovery', 'POST', '/quizzes', payload, 201)
        log('Recovery without API restart: ' + str(result['same_api_process_after_recovery']) +
            ', elapsed_seconds=' + str(result['recovery_seconds']))
        result['rows'] = run(['docker', 'exec', name, 'psql', '-U', 'quiz007', '-d', 'quiz007_test', '-Atc',
                              'SELECT count(*) FROM "Quiz"; SELECT count(*) FROM "Question"; SELECT count(*) FROM "AnswerOption";']).stdout.strip().splitlines()
        result['performance_errors'] = sum(row['errors'] for row in result['performance'])
        result['completed'] = True
        log('007_DIAGNOSTICS_COMPLETE performance_errors=' + str(result['performance_errors']))
    except Exception as error:
        result['completed'] = False
        result['failure'] = type(error).__name__ + ': ' + str(error).replace(password, '<REDACTED>')
        log('007_DIAGNOSTICS_FAILED ' + result['failure'])
        raise
    finally:
        stop_samples.set()
        for connection in connections:
            connection.close()
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        for handle in handles:
            handle.seek(0)
            # Logs are deliberately not copied wholesale: only a credential leak assertion.
            text = handle.read()
            if password in text:
                result['process_log_credential_leak'] = True
            handle.close()
        if created:
            cleanup = run(['docker', 'rm', '-f', name], check=False)
            result['container_removed'] = cleanup.returncode == 0
        result['owned_processes_stopped'] = all(p.poll() is not None for p in processes)
        (output / '007-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        log('Cleanup: own API/Vite stopped; disposable container removed if created; existing volumes untouched.')


if __name__ == '__main__':
    main()
