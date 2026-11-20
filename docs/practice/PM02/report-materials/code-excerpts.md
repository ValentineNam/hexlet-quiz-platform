# Проверенные листинги ПМ02

Срез main 67a11ad, дата сверки 20.11.2026. Восемь фрагментов извлечены непосредственно из исходников; сохранены все строки и отступы. Ограждение text предотвращает автоматическое изменение фрагментов форматтером. Часть фрагментов показывает только участок функции; это не отдельные компилируемые программы.

## 1. Контракты авторского запроса и публичного ответа

Источник: [packages/shared/src/quiz-contracts.ts](../../../../packages/shared/src/quiz-contracts.ts), строки 8–31, commit 67a11ad. Разделены данные с ключом правильности и публичный DTO, где разрешены только id/text вариантов.

```text
export interface CreateQuizRequest {
  title: string;
  description?: string;
  category?: string;
  questions: Question[];
}

/** Explicit whitelist: no isCorrect, answer keys, or authoring explanation. */
export type PublicQuestion = Pick<
  Question,
  'type' | 'text' | 'image' | 'timeLimitSeconds' | 'maxPoints'
> & {
  id: string;
  options: Pick<AnswerOption, 'id' | 'text'>[];
};

export interface PublicQuizResponse {
  id: string;
  title: string;
  description: string;
  category: string;
  createdAt: string;
  questions: PublicQuestion[];
}
```

## 2. Контроллер NestJS

Источник: [apps/api/src/quizzes/quizzes.controller.ts](../../../../apps/api/src/quizzes/quizzes.controller.ts), строки 13–27, commit 67a11ad. Runtime body остаётся unknown; GET использует UUID v4 pipe. Стандартные коды POST201/GET200 задаёт Nest.

```text
@Controller('quizzes')
export class QuizzesController {
  constructor(
    @Inject(QuizzesService) private readonly quizzes: QuizzesService,
  ) {}
  @Post()
  create(@Body() input: unknown): Promise<PublicQuizResponse> {
    return this.quizzes.create(input);
  }
  @Get(':id')
  get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<PublicQuizResponse> {
    return this.quizzes.get(id);
  }
```

## 3. Серверная проверка вопросов

Источник: [apps/api/src/quizzes/prepare-quiz.ts](../../../../apps/api/src/quizzes/prepare-quiz.ts), строки 87–103, commit 67a11ad. Валидация до записи, существующий shared-валидатор и префиксы вложенных полей ошибок.

```text
  // Reject invalid metadata before traversing questions; the HTTP JSON body is limited to 100 KiB.
  if (errors.length) return fail();
  const questions: Question[] = [];
  for (let i = 0; i < record.questions.length; i += 1) {
    const result = validateQuestion(record.questions[i]);
    if (!result.success) {
      errors.push(
        ...result.errors.map((error) => ({
          ...error,
          field:
            error.field === '$'
              ? `questions[${i}]`
              : `questions[${i}].${error.field}`,
        })),
      );
      return fail();
    }
```

## 4. Prisma: атомарное сохранение связанных строк

Источник: [apps/api/src/quizzes/quizzes.service.ts](../../../../apps/api/src/quizzes/quizzes.service.ts), строки 46–75, commit 67a11ad. Один nested create сохраняет родителей и детей атомарно. Это не вызов $transaction вручную; positions фиксируют порядок. Перехват ошибки следует в исходнике дальше.

```text
  async create(input: unknown): Promise<PublicQuizResponse> {
    const prepared = prepareQuiz(input);
    try {
      const quiz = await this.prisma.quiz.create({
        data: {
          title: prepared.title,
          description: prepared.description,
          category: prepared.category,
          questions: {
            create: prepared.questions.map((question, position) => ({
              position,
              type: question.type,
              text: question.text,
              image: question.image,
              timeLimitSeconds: question.timeLimitSeconds,
              maxPoints: question.maxPoints,
              options: {
                create: question.options.map((option, optionPosition) => ({
                  key: option.id,
                  position: optionPosition,
                  text: option.text,
                  isCorrect: option.isCorrect,
                })),
              },
            })),
          },
        },
        include,
      });
      return publicQuiz(quiz);
```

## 5. Frontend: типизированный HTTP-клиент

Источник: [apps/web/src/quiz-api.ts](../../../../apps/web/src/quiz-api.ts), строки 108–119, commit 67a11ad. POST сериализует CreateQuizRequest; GET кодирует введённый ID. Путь /api обрабатывает dev-proxy.

```text
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
```

## 6. Frontend: отправка и блокировка

Источник: [apps/web/src/QuizWorkspace.tsx](../../../../apps/web/src/QuizWorkspace.tsx), строки 59–87, commit 67a11ad. Ref-флаг проверяется синхронно, данные готовятся через prepareDraft, успешный флаг устанавливается лишь после проверенного createQuiz. busy снимается в finally.

```text
  async function save(event: FormEvent) {
    event.preventDefault();
    if (locked.current || hasSaved.current) return;
    const result = prepareDraft(title, description, questions);
    setMessage('');
    setErrors([]);
    setQuiz(null);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    locked.current = true;
    setBusy(true);
    try {
      const saved = await createQuiz(result.data);
      if (mounted.current) {
        hasSaved.current = true;
        setSavedId(saved.id);
        setLookup(saved.id);
        setMessage(
          'Квиз сохранён. Нажмите «Получить квиз», чтобы прочитать данные из БД.',
        );
      }
    } catch (error) {
      if (mounted.current) failure(error);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
```

## 7. Сохранение статуса при нечитаемом ответе

Источник: [apps/web/src/quiz-api.ts](../../../../apps/web/src/quiz-api.ts), строки 67–105, commit 67a11ad. Ошибка JSON не уничтожает HTTP-статус. Только 400 обрабатывается как INVALID_QUIZ; POST500/503 и повреждённый успех предупреждают о неопределённом сохранении. UUID-проверка вызывается внутри publicQuiz, строки 19–29 исходника.

```text
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
```

## 8. Реальный тест SQL-ограничения и rollback

Источник: [apps/api/test/database.integration.test.ts](../../../../apps/api/test/database.integration.test.ts), строки 144–173, commit 67a11ad. Прямой Prisma create содержит две дочерние строки, одна с недопустимым временем. Ожидаются исключение и отсутствие родительского Quiz. Setup использует реальную \*\_test PostgreSQL, без mock.

```text
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
```
