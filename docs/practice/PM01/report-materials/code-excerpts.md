# Короткие листинги исходного кода

Сверено 08.11.2026 с HEAD 4ad431b. Диапазоны включительные. Содержимое блоков дословно скопировано из строк исходников, включая отступы; фрагменты функций требуют окружающего контекста и не являются самостоятельными программами. При изменении исходников номера нужно обновить.

## Валидация корневого входа

Файл: [packages/shared/src/question-validation.ts](../../../../packages/shared/src/question-validation.ts#L69-L79), строки **69–79**.

Неверный корневой тип немедленно даёт структурированную ошибку.

<!-- prettier-ignore -->
```ts
  if (!isRecord(input)) {
    return {
      success: false,
      errors: [
        {
          code: 'INVALID_TYPE',
          field: '$',
          message: 'Вопрос должен быть объектом.',
        },
      ],
    };
```

## Ограничение массива вариантов

Файл: [packages/shared/src/question-validation.ts](../../../../packages/shared/src/question-validation.ts#L134-L147), строки **134–147**.

Недопустимое количество вариантов не приводит к обходу массива.

<!-- prettier-ignore -->
```ts
  const options: AnswerOption[] = [];
  if (!Array.isArray(input.options)) {
    addError(
      'INVALID_TYPE',
      'options',
      'Варианты ответа должны быть массивом.',
    );
  } else if (input.options.length < 2 || input.options.length > 6) {
    // Do not inspect elements or count correct answers in an invalid-size array.
    addError(
      'OPTION_COUNT',
      'options',
      'Требуется от 2 до 6 вариантов ответа.',
    );
```

## Точные баллы

Файл: [packages/shared/src/answer-scoring.ts](../../../../packages/shared/src/answer-scoring.ts#L147-L157), строки **147–157**.

t представлен как N/Q; BigInt считает точную дробь и округляет половины вверх без epsilon. Разложение binary64 находится в строках 127–140.

<!-- prettier-ignore -->
```ts
  // durationMs is a multiple of 1000, so durationMs / 5 is an exact integer.
  if (elapsedMs <= durationMs / 5) return maxPoints;
  const [elapsedNumerator, elapsedDenominator] = elapsedFraction(elapsedMs);
  const duration = BigInt(durationMs);
  // P * (9D - 5t) / (8D), algebraically identical after the 20% plateau.
  const numerator =
    BigInt(maxPoints) *
    (9n * duration * elapsedDenominator - 5n * elapsedNumerator);
  const denominator = 8n * duration * elapsedDenominator;
  // Round a nonnegative rational to nearest integer, exact halves upward.
  return Number((2n * numerator + denominator) / (2n * denominator));
```

## Включённый дедлайн

Файл: [apps/web/src/App.tsx](../../../../apps/web/src/App.tsx#L39-L46), строки **39–46**.

Просрочка строго после D; при равенстве вопрос не завершается автоматически.

<!-- prettier-ignore -->
```tsx
  const expireIfDue = useCallback(
    (elapsedMs: number): boolean => {
      if (elapsedMs <= durationMs) return false;
      finish({ status: 'timeout', score: 0 }, elapsedMs);
      return true;
    },
    [durationMs, finish],
  );
```

## Оценка через shared

Файл: [apps/web/src/App.tsx](../../../../apps/web/src/App.tsx#L70-L88), строки **70–88**.

evaluateAnswer импортирован в строке 2. Формула не дублируется; finish однократно фиксирует результат.

<!-- prettier-ignore -->
```tsx
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (settled.current) return;
    const elapsedMs = Math.max(0, performance.now() - startedAt.current);
    // Shared decides whether a selected answer arrived on time, including equality.
    if (selected.length === 0) {
      expireIfDue(elapsedMs);
      return;
    }
    const result = evaluateAnswer(question, selected, elapsedMs);
    finish(
      result.status === 'late'
        ? { status: 'timeout', score: 0 }
        : {
            status: result.isCorrect ? 'correct' : 'incorrect',
            score: result.score,
          },
      elapsedMs,
    );
```

## Однократная фиксация

Файл: [apps/web/src/App.tsx](../../../../apps/web/src/App.tsx#L28-L37), строки **28–37**.

Ref settled блокирует повтор до обновления React-state. Удаление visibilitychange при unmount — строки 60–63.

<!-- prettier-ignore -->
```tsx
  const finish = useCallback(
    (nextOutcome: Outcome, elapsedMs: number) => {
      if (settled.current) return;
      settled.current = true;
      window.clearInterval(interval.current);
      setRemainingMs(Math.max(0, durationMs - elapsedMs));
      setOutcome(nextOutcome);
    },
    [durationMs],
  );
```

## Адаптивная сетка

Файл: [apps/web/src/styles.css](../../../../apps/web/src/styles.css#L383-L389), строки **383–389**.

Фрагмент находится внутри @media (max-width: 900px), начинающегося в строке 379: сетка становится одноколоночной, minmax(0,1fr) ограничивает растяжение.

<!-- prettier-ignore -->
```css
  .player-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
    padding: 28px 0;
    max-width: 640px;
    margin: auto;
  }
```
