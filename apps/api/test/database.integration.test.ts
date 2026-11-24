import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { QuizzesModule } from '../src/quizzes/quizzes.module';
import { quizInput } from './quiz.fixture';

// Explicit opt-in command. Refuse an ordinary database; only a *_test database is allowed.
const testUrl = process.env.TEST_DATABASE_URL;
function isTestDatabase(url: string | undefined): boolean {
  try {
    return Boolean(
      url &&
        ['postgres:', 'postgresql:'].includes(new URL(url).protocol) &&
        new URL(url).pathname.endsWith('_test'),
    );
  } catch {
    return false;
  }
}
const safeDatabase = isTestDatabase(testUrl);
const createdIds: string[] = [];
let app: INestApplication | undefined;
let prisma: PrismaClient | undefined;
let previousUrl: string | undefined;
let configured = false;
beforeAll(async () => {
  if (!safeDatabase)
    throw new Error(
      'Нужен TEST_DATABASE_URL с отдельной базой *_test; тест не запускается на обычной БД.',
    );
  previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = testUrl;
  configured = true;
  prisma = new PrismaClient({ datasources: { db: { url: testUrl } } });
  await prisma.$connect();
  const module = await Test.createTestingModule({
    imports: [QuizzesModule],
  }).compile();
  app = module.createNestApplication();
  await app.listen(0, '127.0.0.1');
});
afterAll(async () => {
  try {
    if (prisma)
      await prisma.quiz.deleteMany({ where: { id: { in: createdIds } } });
  } finally {
    await app?.close();
    await prisma?.$disconnect();
    if (configured) {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
    }
  }
});
describe('real PostgreSQL + Prisma + NestJS', () => {
  it('stores and retrieves both question types in order without answer keys', async () => {
    if (!app || !prisma) throw new Error('Database test setup failed');
    const first = quizInput().questions[0];
    const payload = {
      ...quizInput(),
      questions: [
        first,
        {
          ...first,
          type: 'multiple',
          text: '',
          image: 'image-key',
          timeLimitSeconds: 5,
          maxPoints: 2000,
          options: first.options.map((option) => ({
            ...option,
            isCorrect: true,
          })),
        },
      ],
    };
    const post = await request(app.getHttpServer())
      .post('/quizzes')
      .send(payload)
      .expect(201);
    createdIds.push(post.body.id);
    const get = await request(app.getHttpServer())
      .get(`/quizzes/${post.body.id}`)
      .expect(200);
    expect(get.body).toEqual(post.body);
    expect(get.body.questions.map((q: { type: string }) => q.type)).toEqual([
      'single',
      'multiple',
    ]);
    expect(
      get.body.questions[0].options.map((o: { id: string }) => o.id),
    ).toEqual(['a', 'b']);
    expect(get.body.questions[1].image).toBe('image-key');
    expect(JSON.stringify(get.body)).not.toMatch(/isCorrect|correctAnswer/);
    const persisted = await prisma.quiz.findUniqueOrThrow({
      where: { id: post.body.id },
      include: { questions: { include: { options: true } } },
    });
    expect(
      persisted.questions.flatMap((q) => q.options).filter((o) => o.isCorrect),
    ).toHaveLength(3);
  });
  it('rejects invalid data without partially creating a quiz', async () => {
    if (!app || !prisma) throw new Error('Database test setup failed');
    const payload = quizInput();
    payload.questions[0].options[1].id = 'a';
    const title = 'invalid-005-' + crypto.randomUUID();
    await request(app.getHttpServer())
      .post('/quizzes')
      .send({ ...payload, title })
      .expect(400);
    expect(await prisma.quiz.count({ where: { title } })).toBe(0);
  });
  it('enforces unique option keys inside a question', async () => {
    if (!prisma) throw new Error('Database test setup failed');
    const title = 'unique-005-' + crypto.randomUUID();
    await expect(
      prisma.quiz.create({
        data: {
          title,
          questions: {
            create: {
              position: 0,
              type: 'single',
              text: 'q',
              timeLimitSeconds: 30,
              maxPoints: 1000,
              options: {
                create: [
                  { key: 'a', position: 0, text: 'A', isCorrect: true },
                  { key: 'a', position: 1, text: 'B', isCorrect: false },
                ],
              },
            },
          },
        },
      }),
    ).rejects.toThrow();
    expect(await prisma.quiz.count({ where: { title } })).toBe(0);
  });
  it('enforces SQL ranges and rolls a nested create back atomically', async () => {
    if (!prisma) throw new Error('Database test setup failed');
    const title = 'rollback-005-' + crypto.randomUUID();
    await expect(
      prisma.quiz.create({
        data: {
          title,
          questions: {
            create: [
              {
                position: 0,
                type: 'single',
                text: 'valid',
                timeLimitSeconds: 30,
                maxPoints: 1000,
              },
              {
                position: 1,
                type: 'single',
                text: 'invalid',
                timeLimitSeconds: 4,
                maxPoints: 1000,
              },
            ],
          },
        },
      }),
    ).rejects.toThrow();
    expect(await prisma.quiz.count({ where: { title } })).toBe(0);
  });
  it('checks real PostgreSQL readiness with no answer data in response', async () => {
    if (!app) throw new Error('Database test setup failed');
    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(200);
    expect(response.body).toEqual({ status: 'ready' });
  });
});
