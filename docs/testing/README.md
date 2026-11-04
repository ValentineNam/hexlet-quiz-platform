Автотесты: HTTP GET /health через NestJS + Supertest и отображение стартовой страницы через Testing Library. Команда: `pnpm test`. Свидетельства bootstrap находятся в ../practice/PM01/evidence.

[Ручная проверка интерфейса 04.11.2026](frontend-manual-2026-11-04.md): Chrome DevTools, iPhone SE, 375 × 667 px; также зафиксирована открытая проблема запуска `corepack pnpm dev`.

Валидация вопросов: 93 unit-теста в `packages/shared/src/question-validation.test.ts`, запуск `pnpm --filter @quiz/shared test` или общим `pnpm test`. [Алгоритм и таблица данных](../tasks/002-question-validation.md), [фактические результаты](../practice/PM01/evidence/002-question-validation.md).

После завершающего рефакторинга: [сценарии недопустимой длины массива и результаты до/после](../practice/PM01/evidence/002-refactor.md).
