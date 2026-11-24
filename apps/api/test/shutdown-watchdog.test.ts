import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  installShutdownWatchdog,
  type ShutdownRuntime,
} from '../src/shutdown-watchdog';
import { PrismaService } from '../src/database/prisma.service';
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
function runtime() {
  const emitter = Object.assign(new EventEmitter(), { exit: vi.fn() });
  return {
    emitter,
    install: () =>
      installShutdownWatchdog(emitter as unknown as ShutdownRuntime),
  };
}
it('duplicate and mixed signals start just one deadline, not another close operation', async () => {
  const r = runtime();
  const dispose = r.install();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  r.emitter.emit('SIGTERM');
  await vi.advanceTimersByTimeAsync(4000);
  r.emitter.emit('SIGINT');
  r.emitter.emit('SIGTERM');
  expect(vi.getTimerCount()).toBe(1);
  expect(r.emitter.exit).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(r.emitter.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(console.error).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining('SHUTDOWN_DEADLINE'),
  );
  expect(vi.getTimerCount()).toBe(0);
  dispose();
});
it.each(['SIGTERM', 'SIGINT'])(
  'observer removes itself before Nest re-signals %s',
  (signal) => {
    const r = runtime();
    const dispose = r.install();
    r.emitter.emit(signal);
    expect(r.emitter.listenerCount(signal)).toBe(0);
    dispose();
    expect(vi.getTimerCount()).toBe(0);
  },
);
it('normal process exit clears deadline and all own listeners', () => {
  const r = runtime();
  r.install();
  r.emitter.emit('SIGTERM');
  r.emitter.emit('exit', 0);
  expect(vi.getTimerCount()).toBe(0);
  expect(r.emitter.listenerCount('SIGINT')).toBe(0);
  expect(r.emitter.listenerCount('SIGTERM')).toBe(0);
});
it('installation/disposal alone does not start any timer', () => {
  const r = runtime();
  const dispose = r.install();
  expect(vi.getTimerCount()).toBe(0);
  dispose();
  expect(r.emitter.eventNames()).toEqual([]);
});
it('disconnect rejection is sanitized before reaching Nest logging', async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@127.0.0.1/test_db');
  const prisma = new PrismaService();
  vi.spyOn(prisma, '$disconnect').mockRejectedValue(
    new Error('postgresql://user:SECRET@private/db'),
  );
  await expect(prisma.onModuleDestroy()).rejects.toThrow(
    'Не удалось корректно отключиться от БД.',
  );
});
