# Проверенные листинги № 006

Дата: 17.11.2026. Фрагменты извлечены из фактических файлов после форматирования; номера строк относятся к текущим незакоммиченным изменениям № 006.

## apps/web/src/quiz-draft.ts, строки 52–71

Проверка вопроса через shared и перенос путей ошибок.

```typescript
draft.forEach((q, index) => {
  const result = validateQuestion({
    ...q,
    timeLimitSeconds: q.timeLimitSeconds.trim()
      ? Number(q.timeLimitSeconds)
      : NaN,
    maxPoints: q.maxPoints.trim() ? Number(q.maxPoints) : NaN,
  });
  if (result.success) questions.push(result.data);
  else
    errors.push(
      ...result.errors.map((e) => ({
        ...e,
        field:
          e.field === '$'
            ? `questions[${index}]`
            : `questions[${index}].${e.field}`,
      })),
    );
});
```

## apps/web/src/quiz-api.ts, строки 108–119

Типизированные POST и GET; относительный путь проходит через proxy. Диапазон актуализирован 20.11.2026 после исправления обработки ответов.

```typescript
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

## apps/web/vite.config.ts, строки 21–26

Loopback proxy с удалением /api, без PostgreSQL переменных во frontend.

```typescript
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
```

## apps/web/src/QuizWorkspace.tsx, строки 61–82

Синхронная блокировка и фиксация успешного создания до обновления React state.

```tsx
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
```
