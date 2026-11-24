#!/usr/bin/env python3
"""Isolated readiness/shutdown regression; no existing DB, .env editing, or volumes."""
import argparse
import concurrent.futures
import http.client
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', required=True)
    parser.add_argument('--output', default='docs/practice/PM04/evidence')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    out = root / args.output
    out.mkdir(parents=True, exist_ok=True)
    password = secrets.token_hex(24)
    name = 'quiz008a-' + secrets.token_hex(5)
    env = os.environ.copy()
    for key in ('DATABASE_URL', 'TEST_DATABASE_URL', 'PORT', 'ENABLE_QUIZ_API'):
        env.pop(key, None)
    env['POSTGRES_PASSWORD'] = password
    created, paused = False, False
    api = None
    port = 0
    files = []
    results = {'date': args.date, 'shutdown_deadline_ms': 5000,
               'shutdown_tolerance_ms': 1500, 'shutdown': [], 'waves': []}

    def log(text):
        text = str(text).replace(password, '<REDACTED>').replace(str(Path.home()), '<HOME>')
        with (out / '008a-checks.txt').open('a') as handle:
            handle.write(text + '\n')
        print(text, flush=True)

    def run(command, check=True):
        r = subprocess.run(command, cwd=root, env=env, capture_output=True, text=True, timeout=40)
        log('$ ' + ' '.join(command) + '\n' + r.stdout + r.stderr + 'exit=' + str(r.returncode))
        if check:
            r.check_returncode()
        return r

    def free_port():
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            return sock.getsockname()[1]

    def pg_ready():
        for _ in range(60):
            r = subprocess.run(['docker', 'exec', name, 'pg_isready', '-U', 'quiz008a', '-d', 'quiz008a_test'], capture_output=True, timeout=3)
            if r.returncode == 0:
                return
            time.sleep(.1)
        raise RuntimeError('Owned test database not ready')

    def request(path, method='GET', body=None):
        began = time.monotonic()
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=8)
        try:
            connection.request(method, path, body, {'Content-Type': 'application/json'})
            response = connection.getresponse()
            text, status = response.read().decode(), response.status
        except (OSError, http.client.HTTPException):
            status, text = 0, 'connection_closed'
        finally:
            connection.close()
        assert password not in text
        for marker in ('postgresql://', 'PrismaClient', 'DATABASE_URL', 'stack'):
            assert marker not in text
        return {'status': status, 'body': text, 'ms': (time.monotonic() - began) * 1000}

    def start():
        nonlocal api, port
        port = free_port()
        env['PORT'] = str(port)
        handle = tempfile.TemporaryFile(mode='w+t')
        files.append(handle)
        api = subprocess.Popen(['node', 'dist/main.js'], cwd=root / 'apps/api', env=env, stdout=handle, stderr=subprocess.STDOUT)
        log('OWNED API node dist/main.js, PORT=' + str(port) + ', ENABLE_QUIZ_API=true')
        for _ in range(100):
            if request('/health')['status'] == 200:
                return api, handle
            if api.poll() is not None:
                raise RuntimeError('API startup failed')
            time.sleep(.05)
        raise RuntimeError('API did not start')

    def ready():
        for _ in range(60):
            response = request('/ready')
            if response['status'] == 200:
                assert json.loads(response['body']) == {'status': 'ready'}
                return response
            time.sleep(.1)
        raise RuntimeError('Readiness recovery failed')

    def children(pid):
        r = subprocess.run(['ps', '-axo', 'pid=,ppid='], capture_output=True, text=True, timeout=3)
        pairs = [tuple(map(int, line.split())) for line in r.stdout.splitlines() if len(line.split()) == 2]
        owned = set()
        frontier = {pid}
        while frontier:
            frontier = {child for child, parent in pairs if parent in frontier} - owned
            owned.update(frontier)
        return sorted(owned)

    def stop(label, process, handle, signal='SIGTERM', mixed=False):
        descendants = children(process.pid)
        began = time.monotonic()
        import signal as signals
        process.send_signal(getattr(signals, signal))
        if mixed:
            time.sleep(.05)
            if process.poll() is None:
                process.send_signal(signals.SIGINT)
                process.send_signal(signals.SIGTERM)
        try:
            code = process.wait(timeout=6.5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            raise RuntimeError('Shutdown exceeded 6500ms test tolerance')
        duration = (time.monotonic() - began) * 1000
        handle.seek(0)
        text = handle.read()
        assert password not in text and env['DATABASE_URL'] not in text
        remaining = []
        for pid in descendants:
            try:
                os.kill(pid, 0)
                remaining.append(pid)
            except ProcessLookupError:
                pass
        assert not remaining
        row = {'case': label, 'signal': signal, 'mixed_signals': mixed, 'exit': code,
               'elapsed_ms': duration, 'deadline_markers': text.count('SHUTDOWN_DEADLINE'),
               'children_before': descendants, 'children_remaining': remaining}
        results['shutdown'].append(row)
        log('SHUTDOWN ' + json.dumps(row))
        log('OWNED API stdout/stderr (safe):\n' + text)
        assert duration < 6500
        assert row['deadline_markers'] <= 1
        return row

    log(args.date + ' Europe/Moscow. 008a actual compiled main; only owned PostgreSQL, four shutdown scenarios.')
    try:
        dbport = free_port()
        run(['docker', 'run', '-d', '--name', name, '--memory=512m', '--cpus=2', '-e', 'POSTGRES_PASSWORD',
             '-e', 'POSTGRES_USER=quiz008a', '-e', 'POSTGRES_DB=quiz008a_test',
             '-p', f'127.0.0.1:{dbport}:5432', 'postgres:17.6-alpine'])
        created = True
        pg_ready()
        env['DATABASE_URL'] = f'postgresql://quiz008a:{password}@127.0.0.1:{dbport}/quiz008a_test?connect_timeout=1&pool_timeout=2'
        env['TEST_DATABASE_URL'] = env['DATABASE_URL']
        env['ENABLE_QUIZ_API'] = 'true'
        run(['pnpm', '--filter', '@quiz/api', 'db:migrate'])
        run(['pnpm', '--filter', '@quiz/api', 'test:integration'])
        process, handle = start()
        ready()
        payload = json.dumps({'title': '008a synthetic', 'questions': [{'type': 'single', 'text': 'q', 'timeLimitSeconds': 30, 'maxPoints': 1000,
                              'options': [{'id': 'a', 'text': 'A', 'isCorrect': True}, {'id': 'b', 'text': 'B', 'isCorrect': False}]}]}).encode()
        posted = request('/quizzes', 'POST', payload)
        assert posted['status'] == 201 and 'isCorrect' not in posted['body']
        dto = json.loads(posted['body'])
        run(['docker', 'pause', name])
        paused = True
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            for wave in range(4):
                responses = list(pool.map(lambda _: request('/ready'), range(8)))
                assert all(r['status'] == 503 and json.loads(r['body']) == {'status': 'not_ready'} for r in responses)
                assert request('/health')['body'] == '{"status":"ok"}'
                if wave:
                    assert max(r['ms'] for r in responses) < 1000
                row = {'wave': wave + 1, 'requests': 8, 'latencies_ms': [r['ms'] for r in responses], 'statuses': [r['status'] for r in responses]}
                results['waves'].append(row)
                log('PAUSED READY ' + json.dumps(row))
        run(['docker', 'unpause', name])
        paused = False
        results['ready_after_unpause'] = ready()
        assert json.loads(request('/quizzes/' + dto['id'])['body']) == dto
        row = stop('healthy SIGTERM after readiness recovery', process, handle)
        assert row['exit'] in (0, -15) and row['deadline_markers'] == 0

        process, handle = start()  # Only /health: no unfinished readiness query.
        run(['docker', 'pause', name])
        paused = True
        row = stop('paused DB without readiness query', process, handle)
        assert row['exit'] in (0, -15, 1)
        run(['docker', 'unpause', name])
        paused = False
        pg_ready()

        process, handle = start()
        ready()
        run(['docker', 'pause', name])
        paused = True
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(request, '/ready')
            time.sleep(.15)
            assert not pending.done()
            row = stop('paused DB with pending readiness', process, handle, mixed=True)
            assert row['exit'] == 1 and row['deadline_markers'] == 1
            results['pending_http_during_shutdown'] = pending.result(timeout=3)
        run(['docker', 'unpause', name])
        paused = False
        pg_ready()
        process, handle = start()
        results['ready_after_forced_restart'] = ready()
        assert json.loads(request('/quizzes/' + dto['id'])['body']) == dto
        assert request('/quizzes', 'POST', payload)['status'] == 201
        row = stop('restart after forced termination, healthy SIGINT', process, handle, signal='SIGINT')
        assert row['exit'] in (0, -2) and row['deadline_markers'] == 0
        results['completed'] = True
        log('008a_REAL_POSTGRES_SHUTDOWN_COMPLETE')
    finally:
        if paused:
            run(['docker', 'unpause', name], check=False)
        if api and api.poll() is None:
            api.kill()
            api.wait()
        if created:
            removed = run(['docker', 'rm', '-f', '-v', name], check=False)
            results['container_removed'] = removed.returncode == 0
        for handle in files:
            handle.close()
        results['owned_api_stopped'] = api is None or api.poll() is not None
        (out / '008a-postgres-results.json').write_text(json.dumps(results, indent=2) + '\n')


if __name__ == '__main__':
    main()
