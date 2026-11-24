import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
let app: INestApplication | undefined;
async function setup(transaction = vi.fn(), enabled = true) {
  const module = await Test.createTestingModule({
    imports: [AppModule.configure(enabled)],
  })
    .overrideProvider(PrismaService)
    .useValue({ $transaction: transaction })
    .compile();
  app = module.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  return app;
}
afterEach(async () => {
  await app?.close();
  app = undefined;
});
it('ready200 uses read-only SQL with transaction/statement bounds; health unchanged', async () => {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([{ value: 1 }]),
  };
  const transaction = vi.fn(
    async (work: (client: typeof tx) => Promise<void>) => work(tx),
  );
  const api = await setup(transaction);
  const response = await request(api.getHttpServer()).get('/ready').expect(200);
  expect(response.body).toEqual({ status: 'ready' });
  expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
    maxWait: 250,
    timeout: 1000,
  });
  expect(tx.$executeRaw.mock.calls[0][0].join('')).toBe(
    "SET LOCAL statement_timeout = '750ms'",
  );
  expect(tx.$queryRaw.mock.calls[0][0].join('')).toBe('SELECT 1');
  expect(
    (await request(api.getHttpServer()).get('/health').expect(200)).body,
  ).toEqual({ status: 'ok' });
});
it('ready503 is generic for DB errors, while health stays200', async () => {
  const api = await setup(
    vi
      .fn()
      .mockRejectedValue(
        new Error('postgresql://user:SECRET@internal:5432/db SQL stack'),
      ),
  );
  const response = await request(api.getHttpServer()).get('/ready').expect(503);
  expect(response.body).toEqual({ status: 'not_ready' });
  expect(JSON.stringify(response.body)).not.toMatch(
    /SECRET|internal|SQL|stack|postgresql/,
  );
  await request(api.getHttpServer()).get('/health').expect(200);
});
it('hung operation is bounded, shared, and safely settles after HTTP timeout', async () => {
  let reject!: (error: Error) => void;
  const transaction = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, r) => {
          reject = r;
        }),
    )
    .mockResolvedValue(undefined);
  const api = await setup(transaction);
  const started = performance.now();
  const responses = await Promise.all([
    request(api.getHttpServer()).get('/ready'),
    request(api.getHttpServer()).get('/ready'),
  ]);
  expect(responses.map((r) => r.status)).toEqual([503, 503]);
  expect(performance.now() - started).toBeLessThan(2500);
  expect(transaction).toHaveBeenCalledTimes(1);
  await request(api.getHttpServer()).get('/health').expect(200);
  reject(new Error('LATE_PRIVATE'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await request(api.getHttpServer()).get('/ready').expect(200);
  expect(transaction).toHaveBeenCalledTimes(2);
});
it('ready404 and health200 when database API is disabled', async () => {
  const transaction = vi.fn();
  const api = await setup(transaction, false);
  await request(api.getHttpServer()).get('/ready').expect(404);
  await request(api.getHttpServer()).get('/health').expect(200);
  expect(transaction).not.toHaveBeenCalled();
});
