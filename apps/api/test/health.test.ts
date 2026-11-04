import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
it('GET /health returns HTTP 200 and the expected JSON without a database', async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = module.createNestApplication();
  try {
    await app.listen(0, '127.0.0.1');
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  } finally {
    await app.close();
  }
});
