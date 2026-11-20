import { afterEach, expect, it, vi } from 'vitest';
import { createQuiz, getQuiz, QuizApiError } from './quiz-api';
import type { CreateQuizRequest, PublicQuizResponse } from '@quiz/shared';
const input: CreateQuizRequest = {
  title: 'Quiz',
  questions: [
    {
      type: 'single',
      text: 'Q',
      timeLimitSeconds: 30,
      maxPoints: 1000,
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
      ],
    },
  ],
};
const dto: PublicQuizResponse = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  title: 'Quiz',
  description: '',
  category: '',
  createdAt: '2026-11-20T00:00:00Z',
  questions: [],
};
afterEach(() => vi.unstubAllGlobals());
it('accepts the API UUID v4 on HTTP 201 and sends only one request', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(dto), { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  await expect(createQuiz(input)).resolves.toEqual(dto);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([
  '',
  '   ',
  undefined,
  'not-a-uuid',
  '123e4567-e89b-12d3-a456-426614174000',
])(
  'rejects invalid successful POST id %# with uncertain outcome',
  async (id) => {
    const body = { ...dto, id };
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    await expect(createQuiz(input)).rejects.toThrow(
      /Сервер мог сохранить квиз, но подтвердить результат не удалось/,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
const cases = [400, 404, 413, 500, 503].flatMap((status) =>
  ['json', 'empty', 'html'].flatMap((body) =>
    ['GET', 'POST'].map((method) => ({ status, body, method })),
  ),
);
it.each(cases)(
  '$method HTTP $status $body preserves error meaning without leaking raw body',
  async ({ status, body, method }) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            body === 'json'
              ? JSON.stringify({ message: 'PRIVATE_RAW_TEXT' })
              : body === 'empty'
                ? ''
                : '<html>PRIVATE_RAW_TEXT</html>',
            { status },
          ),
        ),
    );
    let caught: unknown;
    try {
      await (method === 'POST' ? createQuiz(input) : getQuiz(dto.id));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(QuizApiError);
    if (!(caught instanceof QuizApiError))
      throw new Error('Expected typed error');
    expect(caught.message).toContain(
      status === 404
        ? 'Квиз не найден'
        : status === 413
          ? '100 KiB'
          : status === 503
            ? 'временно недоступен'
            : String(status),
    );
    expect(caught.message).not.toContain('PRIVATE_RAW_TEXT');
    expect(caught.message).not.toContain('Попробуйте позже');
    expect(caught.errors).toEqual([]);
    if (method === 'POST' && status >= 500)
      expect(caught.message).toContain('Сервер мог сохранить квиз');
    else expect(caught.message).not.toContain('Сервер мог сохранить квиз');
  },
);
it('preserves structured validation only for HTTP 400 without uncertain creation warning', async () => {
  const errors = [
    { code: 'REQUIRED', field: 'title', message: 'Введите название' },
  ];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'INVALID_QUIZ', errors }), {
        status: 400,
      }),
    ),
  );
  await expect(createQuiz(input)).rejects.toMatchObject({
    message: 'Исправьте данные квиза.',
    errors,
  });
});
it('does not treat a 503 body as definitive validation failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'INVALID_QUIZ', errors: [] }), {
        status: 503,
      }),
    ),
  );
  await expect(createQuiz(input)).rejects.toThrow(/временно недоступен/);
});
it.each(['', '<html>RAW_HTML</html>', JSON.stringify({ wrong: 'DTO' })])(
  'warns on damaged successful POST body %# without automatic retry',
  async (body) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(body, { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    await expect(createQuiz(input)).rejects.toThrow(
      /Сервер мог сохранить квиз/,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it('keeps network error typed with uncertain creation warning', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  await expect(createQuiz(input)).rejects.toMatchObject({
    name: 'QuizApiError',
    message: expect.stringContaining(
      'результат сохранения может быть неизвестен',
    ),
  });
});
