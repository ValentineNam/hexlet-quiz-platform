import { afterEach, expect, it, vi } from 'vitest';
import { ReadinessService } from '../src/database/readiness.service';
import type { PrismaService } from '../src/database/prisma.service';
function fixture() {
  let resolve!: (value: unknown) => void, reject!: (reason: Error) => void;
  const raw = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const originalThen = raw.then.bind(raw);
  let subscriptions = 0;
  // Observe the raw promise AND the derived promise old code uses for race.
  vi.spyOn(raw, 'then').mockImplementation((...args) => {
    subscriptions++;
    const derived = originalThen(...args);
    const derivedThen = derived.then.bind(derived);
    vi.spyOn(derived, 'then').mockImplementation((...callbacks) => {
      subscriptions++;
      return derivedThen(...callbacks);
    });
    return derived;
  });
  const transaction = vi
    .fn()
    .mockReturnValueOnce(raw)
    .mockResolvedValue(undefined);
  return {
    service: new ReadinessService({
      $transaction: transaction,
    } as unknown as PrismaService),
    transaction,
    resolve,
    reject,
    subscriptions: () => subscriptions,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('new waves reuse the completed deadline result without subscriptions or timers', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const first = f.service.isReady();
  const initial = Array.from({ length: 8 }, () => f.service.isReady());
  const initialTimers = vi.getTimerCount();
  await vi.advanceTimersByTimeAsync(1500);
  expect(await first).toBe(false);
  expect(await Promise.all(initial)).toEqual(Array(8).fill(false));
  const count = f.subscriptions();
  for (let wave = 0; wave < 4; wave++) {
    const late = Array.from({ length: 32 }, () => f.service.isReady());
    expect(f.subscriptions()).toBe(count);
    expect(vi.getTimerCount()).toBe(0);
    expect(late.every((p) => p === first)).toBe(true);
    expect(await Promise.all(late)).toEqual(Array(32).fill(false));
  }
  expect(initialTimers).toBe(1);
  expect(f.transaction).toHaveBeenCalledTimes(1);
  f.resolve(undefined);
  await vi.advanceTimersByTimeAsync(0);
  expect(await f.service.isReady()).toBe(true);
  expect(f.transaction).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
it('late arrival shares remaining time rather than a fresh 1500 ms', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const a = f.service.isReady();
  await vi.advanceTimersByTimeAsync(1400);
  const b = f.service.isReady();
  expect(b).toBe(a);
  await vi.advanceTimersByTimeAsync(100);
  expect(await b).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  f.reject(new Error('PRIVATE_LATE'));
  await vi.advanceTimersByTimeAsync(0);
});
it.each([0, 1499])(
  'successful operation at %s ms clears deadline and releases state',
  async (delay) => {
    vi.useFakeTimers();
    const f = fixture();
    const p = f.service.isReady();
    await vi.advanceTimersByTimeAsync(delay);
    f.resolve(undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(await p).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(await f.service.isReady()).toBe(true);
  },
);
it('deadline wins if processed first, late success cannot flip old result', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const p = f.service.isReady();
  await vi.advanceTimersByTimeAsync(1500);
  expect(await p).toBe(false);
  f.resolve(undefined);
  await vi.advanceTimersByTimeAsync(0);
  expect(await p).toBe(false);
  expect(await f.service.isReady()).toBe(true);
});
it.each([0, 1600])(
  'reject before/after deadline at %s is handled and allows retry',
  async (delay) => {
    vi.useFakeTimers();
    const f = fixture();
    const p = f.service.isReady();
    await vi.advanceTimersByTimeAsync(delay);
    f.reject(new Error('PRIVATE_DB_ERROR'));
    await vi.advanceTimersByTimeAsync(0);
    expect(await p).toBe(false);
    expect(await f.service.isReady()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  },
);
