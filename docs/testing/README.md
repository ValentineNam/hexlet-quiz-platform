Автотесты: HTTP GET /health через NestJS + Supertest и отображение стартовой страницы через Testing Library. Команда: `pnpm test`. Свидетельства bootstrap находятся в ../practice/PM01/evidence.

[Ручная проверка интерфейса 04.11.2026](frontend-manual-2026-11-04.md): Chrome DevTools, iPhone SE, 375 × 667 px; также зафиксирована открытая проблема запуска `corepack pnpm dev`.

Валидация вопросов: 98 unit-тестов в `packages/shared/src/question-validation.test.ts`, запуск `pnpm --filter @quiz/shared test` или общим `pnpm test`. [Алгоритм и таблица данных](../tasks/002-question-validation.md), [фактические результаты](../practice/PM01/evidence/002-question-validation.md).

После завершающего рефакторинга: [сценарии недопустимой длины массива и результаты до/после](../practice/PM01/evidence/002-refactor.md).

Проверка ответов и начисление баллов: 179 unit-тестов в `packages/shared/src/answer-scoring.test.ts`. Проверены точные баллы для 5/30/120 секунд, границы 20% и дедлайна, округление, монотонность, ошибки аргументов и отсутствие мутаций. [Задача № 003](../tasks/003-answer-scoring.md), [свидетельство](../practice/PM01/evidence/003-answer-scoring.md).

[Рефакторинг 003](../practice/PM01/evidence/003-refactor.md): математически точное округление, границы ресурсов 100/6/256, регрессии полуцелых значений и порядок ошибок.

Задача № 004: 30 тестов frontend-плеера с контролируемым временем; [браузерная проверка размеров, клавиатуры и таймера](004-ui-check-2026-11-04.md), [свидетельство](../practice/PM01/evidence/004-quiz-player-ui.md). Прежний тест стартовой страницы заменён тестами прохождения.

[Точечное исправление дедлайна № 004](../practice/PM01/evidence/004-deadline-fix.md): включённая граница, гонки submit/refresh и проверка идентичности удалённых обработчиков.
