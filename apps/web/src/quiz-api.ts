import type {
  CreateQuizRequest,
  PublicQuizResponse,
  QuizInputError,
} from '@quiz/shared';

export class QuizApiError extends Error {
  constructor(
    message: string,
    readonly errors: QuizInputError[] = [],
  ) {
    super(message);
    this.name = 'QuizApiError';
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function publicQuiz(value: unknown): value is PublicQuizResponse {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.id,
    ) &&
    ['id', 'title', 'description', 'category', 'createdAt'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    Array.isArray(value.questions) &&
    value.questions.every(
      (q) =>
        record(q) &&
        typeof q.id === 'string' &&
        typeof q.text === 'string' &&
        (q.type === 'single' || q.type === 'multiple') &&
        (q.image === undefined || typeof q.image === 'string') &&
        typeof q.timeLimitSeconds === 'number' &&
        typeof q.maxPoints === 'number' &&
        Array.isArray(q.options) &&
        q.options.every(
          (o) =>
            record(o) && typeof o.id === 'string' && typeof o.text === 'string',
        ),
    )
  );
}
async function request(
  path: string,
  init?: RequestInit,
): Promise<PublicQuizResponse> {
  const unknownCreation =
    init?.method === 'POST'
      ? ' Если запрос создания уже отправлен, результат сохранения может быть неизвестен.'
      : '';
  const damagedCreation =
    init?.method === 'POST'
      ? ' Сервер мог сохранить квиз, но подтвердить результат не удалось. Не повторяйте создание без проверки.'
      : '';
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new QuizApiError(
      'Сервер недоступен. Проверьте соединение.' + unknownCreation,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // HTTP status remains authoritative even when its error body is unreadable.
    body = undefined;
  }
  if (!response.ok) {
    if (
      response.status === 400 &&
      record(body) &&
      body.code === 'INVALID_QUIZ' &&
      Array.isArray(body.errors)
    ) {
      const errors = body.errors.filter(
        (e): e is QuizInputError =>
          record(e) &&
          typeof e.code === 'string' &&
          typeof e.field === 'string' &&
          typeof e.message === 'string',
      );
      throw new QuizApiError('Исправьте данные квиза.', errors);
    }
    throw new QuizApiError(
      response.status === 404
        ? 'Квиз не найден.'
        : response.status === 413
          ? 'Квиз превышает допустимый размер запроса (100 KiB).'
          : response.status === 503
            ? 'Сервер временно недоступен (503).' + damagedCreation
            : response.status >= 500
              ? `Ошибка API (${response.status}).` + damagedCreation
              : `Некорректный запрос (${response.status}).`,
    );
  }
  if (!publicQuiz(body))
    throw new QuizApiError(
      'Ответ сервера не соответствует контракту квиза.' + damagedCreation,
    );
  return body;
}
export function createQuiz(
  input: CreateQuizRequest,
): Promise<PublicQuizResponse> {
  return request('/quizzes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
export function getQuiz(id: string): Promise<PublicQuizResponse> {
  return request(`/quizzes/${encodeURIComponent(id.trim())}`);
}
