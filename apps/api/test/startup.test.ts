import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { create, app } = vi.hoisted(() => ({
  create: vi.fn(),
  app: {
    useBodyParser: vi.fn(),
    enableShutdownHooks: vi.fn(),
    listen: vi.fn(),
  },
}));
vi.mock('@nestjs/core', () => ({ NestFactory: { create } }));
vi.mock('../src/shutdown-watchdog', () => ({
  installShutdownWatchdog: vi.fn(() => vi.fn()),
}));
const previousExit = process.exitCode;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  create.mockResolvedValue(app);
  vi.stubEnv('ENABLE_QUIZ_API', 'false');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  process.exitCode = previousExit;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it.each(['abc', '', '   ', '0', '65536', '1.5', 'NaN', 'Infinity', '3000x'])(
  'invalid PORT %# is diagnosed as PORT, with API disabled',
  async (value) => {
    vi.stubEnv('PORT', value);
    await import('../src/main');
    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    expect(create).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/PORT.*1.*65535/),
    );
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toMatch(
      /DATABASE_URL|PostgreSQL|abc|3000x/,
    );
  },
);
it.each([
  { value: undefined, port: 3000 },
  { value: '1', port: 1 },
  { value: '65535', port: 65535 },
  { value: ' 3000 ', port: 3000 },
])(
  'valid/default PORT $value keeps loopback $port',
  async ({ value, port }) => {
    if (value === undefined) delete process.env.PORT;
    else vi.stubEnv('PORT', value);
    await import('../src/main');
    await vi.waitFor(() =>
      expect(app.listen).toHaveBeenCalledWith(port, '127.0.0.1'),
    );
    expect(app.useBodyParser).toHaveBeenCalledWith('json', { limit: '100kb' });
    expect(console.error).not.toHaveBeenCalled();
  },
);
