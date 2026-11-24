import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { expect, it } from 'vitest';
it('compiled main forces bounded stop when a lifecycle hook never settles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quiz-shutdown-'));
  const preload = join(dir, 'preload.cjs');
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  const localRequire = createRequire(join(process.cwd(), 'package.json'));
  const core = localRequire.resolve('@nestjs/core');
  const common = localRequire.resolve('@nestjs/common');
  const reflect = localRequire.resolve('reflect-metadata');
  const appModule = join(process.cwd(), 'dist/app.module.js');
  // Actual Nest lifecycle with a test-only hook that never settles.
  await writeFile(
    preload,
    `require(${JSON.stringify(reflect)});const core=require(${JSON.stringify(core)});const common=require(${JSON.stringify(common)});const {AppModule}=require(${JSON.stringify(appModule)});class TestRoot{};common.Module({imports:[AppModule.configure(false)],providers:[{provide:'TEST_PENDING_HOOK',useValue:{onApplicationBootstrap(){console.log('TEST_BOOTSTRAPPED');},beforeApplicationShutdown(){console.log('HOOK_PENDING');return new Promise(()=>{});}}}]})(TestRoot);const original=core.NestFactory.create.bind(core.NestFactory);core.NestFactory.create=()=>original(TestRoot,{logger:false});`,
  );
  const child = spawn(
    process.execPath,
    ['--require', preload, 'dist/main.js'],
    {
      env: { ...process.env, PORT: String(port), ENABLE_QUIZ_API: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (data) => (output += data.toString()));
  child.stderr.on('data', (data) => (output += data.toString()));
  const exited = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  );
  try {
    for (let i = 0; i < 200 && !output.includes('TEST_BOOTSTRAPPED'); i++)
      await new Promise((r) => setTimeout(r, 20));
    expect(output).toContain('TEST_BOOTSTRAPPED');
    child.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 20));
    child.kill('SIGINT');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      exited,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), 6500);
      }),
    ]);
    clearTimeout(timeout);
    expect(result).toEqual({ code: 1, signal: null });
    expect(output).toContain('SHUTDOWN_DEADLINE');
    expect(output.match(/HOOK_PENDING/g)).toHaveLength(1);
    expect(output).not.toContain('DATABASE_URL');
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
    await exited;
    await rm(dir, { recursive: true, force: true });
  }
}, 10000);
