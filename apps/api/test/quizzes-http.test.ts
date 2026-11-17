import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { QuizzesModule } from '../src/quizzes/quizzes.module';
import { PrismaService } from '../src/database/prisma.service';
import { quizInput } from './quiz.fixture';

const quizId = '123e4567-e89b-42d3-a456-426614174000';
const stored = {
  id: quizId,
  title: 'demo',
  description: '',
  category: '',
  createdAt: new Date('2026-11-17T00:00:00Z'),
  secret: 'DO_NOT_SEND',
  questions: [
    {
      id: quizId,
      type: 'single',
      text: 'q',
      image: null,
      timeLimitSeconds: 30,
      maxPoints: 1000,
      secretAnswer: 'DO_NOT_SEND',
      options: [
        { key: 'b', text: 'B', isCorrect: false, id: 'internal-b' },
        { key: 'a', text: 'A', isCorrect: true, id: 'internal-a' },
      ],
    },
  ],
};
describe('quiz HTTP contract (database mocked)', () => {
  let app: INestApplication;
  const create = vi.fn(),
    findUnique = vi.fn();
  beforeEach(async () => {
    create.mockReset().mockResolvedValue(stored);
    findUnique.mockReset().mockResolvedValue(stored);
    const module = await Test.createTestingModule({ imports: [QuizzesModule] })
      .overrideProvider(PrismaService)
      .useValue({ quiz: { create, findUnique } })
      .compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
  });
  afterEach(async () => {
    await app?.close();
  });
  it('POST returns 201 and explicitly excludes correctness and internal fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/quizzes')
      .send(quizInput())
      .expect(201);
    expect(response.body.questions[0].options).toEqual([
      { id: 'b', text: 'B' },
      { id: 'a', text: 'A' },
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /isCorrect|secret|internal-/,
    );
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args.data.questions.create[0].options.create[0]).toMatchObject({
      key: 'a',
      isCorrect: true,
      position: 0,
    });
    expect(args.include.questions.orderBy).toEqual({ position: 'asc' });
  });
  it('GET uses a safe whitelist and sorted nested queries', async () => {
    const response = await request(app.getHttpServer())
      .get(`/quizzes/${quizId}`)
      .expect(200);
    expect(Object.keys(response.body).sort()).toEqual([
      'category',
      'createdAt',
      'description',
      'id',
      'questions',
      'title',
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /isCorrect|secret|internal-/,
    );
    expect(
      findUnique.mock.calls[0][0].include.questions.include.options.orderBy,
    ).toEqual({ position: 'asc' });
  });
  it('invalid question returns prefixed shared errors and performs no write', async () => {
    const input = quizInput();
    input.questions[0].timeLimitSeconds = 4;
    const response = await request(app.getHttpServer())
      .post('/quizzes')
      .send(input)
      .expect(400);
    expect(response.body).toMatchObject({
      code: 'INVALID_QUIZ',
      errors: [
        { code: 'OUT_OF_RANGE', field: 'questions[0].timeLimitSeconds' },
      ],
    });
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects an oversized JSON request before database access', async () => {
    await request(app.getHttpServer())
      .post('/quizzes')
      .send({ title: 'a'.repeat(110 * 1024) })
      .expect(413);
    expect(create).not.toHaveBeenCalled();
  });
  it('unknown quiz returns 404', async () => {
    findUnique.mockResolvedValue(null);
    const r = await request(app.getHttpServer())
      .get(`/quizzes/${quizId}`)
      .expect(404);
    expect(r.body.code).toBe('QUIZ_NOT_FOUND');
  });
  it('malformed UUID returns 400 without querying PostgreSQL', async () => {
    await request(app.getHttpServer()).get('/quizzes/not-a-uuid').expect(400);
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('database errors return 503 without exposing connection details', async () => {
    create.mockRejectedValue(new Error('DATABASE_URL=secret'));
    findUnique.mockRejectedValue(new Error('DATABASE_URL=secret'));
    const post = await request(app.getHttpServer())
      .post('/quizzes')
      .send(quizInput())
      .expect(503);
    const get = await request(app.getHttpServer())
      .get(`/quizzes/${quizId}`)
      .expect(503);
    for (const response of [post, get]) {
      expect(response.body.code).toBe('DATABASE_UNAVAILABLE');
      expect(JSON.stringify(response.body)).not.toMatch(/secret|DATABASE_URL/);
    }
  });
});
