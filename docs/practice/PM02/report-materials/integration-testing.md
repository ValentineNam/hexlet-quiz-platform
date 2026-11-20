# Проверки интеграции ПМ02

Материалы проверены 20.11.2026, main 67a11ad. Здесь собраны **существующие** результаты; при подготовке № 006a полный набор тестов, PostgreSQL и браузер заново не запускались.

## Реальная PostgreSQL: задача № 005, 17.11

Источники: [005-checks.txt](../evidence/005-checks.txt), [свидетельство](../evidence/005-integration.md), [integration-тесты](../../../../apps/api/test/database.integration.test.ts), [миграция](../../../../apps/api/prisma/migrations/202611170001_init_quizzes/migration.sql).

- В отдельном postgres:17.6-alpine / quiz005_test прошли pg_isready, Prisma validate и migrate deploy. migrate status подтвердил актуальную схему; второй deploy сообщил отсутствие pending migrations. SQL подтвердил версию 17.6 и одну завершённую миграцию.
- Четыре теста используют настоящий PrismaClient и QuizzesModule: создание/чтение single и multiple, порядок, image-only, отсутствие isCorrect в JSON и наличие ключа в БД; отказ невалидному вводу без частичной записи; уникальность option key; SQL CHECK времени и rollback nested create.
- Собранный Node API отдельно проверен по HTTP: /health 200, POST 201, GET 200, одинаковый безопасный DTO. /health отдельно означает только liveness.
- Контейнер и проверочный API остановлены. Существующий compose volume не мигрировался/не очищался этими тестами.

В тесте rollback намеренно используется внутренний прямой Prisma create, минующий API: одна вложенная строка имеет timeLimitSeconds=4. Ошибка SQL откатывает родительский Quiz. Сам по себе HTTP 400 доказывал бы только валидацию, а не транзакционность БД. Удаление успешных тестовых квизов использует cascade FK; отдельного исчерпывающего теста всех FK/каскадов нет. Межстрочные условия количества вариантов/правильных остаются в validateQuestion, не в CHECK.

## Источник A1: конкурентные запросы независимого аудита

Временный файл /private/tmp/quiz005-audit-postgres.txt доступен в рабочей среде и прочитан при № 006a. Он не входит в Git. Ниже сохранён его фактический фрагмент с номерами строк и SHA-256 исходного файла; это отдельное аудиторское свидетельство, не часть 005-checks.txt и не CI. Дата 17.11 указана в самом заголовке этого журнала; архив всего исходного файла в репозитории отсутствует.

SHA-256 исходного A1: `d496eb860a8ae4257039bbea4525bd816684edf27e1f428bbe4890412d03fa76`.

```text
120: Compiled API process: GET /health = 200, status=ok; real DATABASE_URL enabled, loopback only.
121: Compiled API: POST /quizzes = 201; GET /quizzes/{id} = 200; identical DTO, ordered IDs; isCorrect absent. Secrets not logged.
122: Independent concurrency: 10 simultaneous POST requests => 10 distinct complete quizzes; all GET roundtrips equal; success.
123: Independent HTTP: malformed UUID400, missing404, oversized413, invalid JSON400, boolean string400, valid surrogate pair Unicode201; success.
124: Independent startup: unreachable PostgreSQL => nonzero exit, no connection credentials in stdout/stderr; success.
```

Десять одновременных POST создали десять разных квизов с полными GET roundtrip. Это небольшая проверка конкуренции, а не нагрузочное измерение и не гарантия идемпотентности. В том же временном логе есть намеренная SQL-мутация с ожидаемым падением теста; её нельзя считать ошибкой исходной миграции. Для официального приложения с полными логами потребуется отдельно архивировать исходный A1. Проверенный фрагмент уже пригоден как иллюстрация ограниченного аудита.

## Браузерный путь: задача № 006, 17.11

Источники: [006-checks.txt](../evidence/006-checks.txt), [протокол](../../../testing/006-e2e-2026-11-17.md), [JSON](../evidence/006-browser-results.json), [реестр изображений](screenshots.md).

Настоящий Chrome/157.0.8103.79 headless управлялся через CDP. Это браузерная автоматизация, не ручная проверка смартфона и не jsdom. Форма создала single/multiple, переставила вопрос, отправила два быстрых submit-события. Network зарегистрировал ровно один POST /api/quizzes (201), затем отдельный GET (200). Запросы прошли Vite proxy → собранный NestJS → Prisma → отдельный PostgreSQL. SQL: 1 Quiz, 2 Question, 8 AnswerOption, 3 правильных. В публичном JSON нет isCorrect; интерфейс не показывает элементы выбора правильности в article. Порядок вопросов/вариантов сохранён.

Проверены editor и saved/public на 320/375/430/768/1280 CSS px, viewport height 900, deviceScaleFactor=1, mobile=false. scrollWidth равен viewport во всех десяти измерениях. Минимальная высота кнопок редактора 46 px, Tab дал outline solid 3px; включён reduced-motion. Пять PNG относятся к последнему из двух успешных прогонов; ID b99ad429-755f-4ece-8903-7ccdcdd4e7d7 совпадает в JSON/протоколе/логе. После теста временная БД удалена, этот ID не относится к постоянной БД.

Первая попытка остановилась на занятом 3000 до создания контейнера; затем использованы свободный API-порт и QUIZ_API_PORT. В старом логе есть общее сообщение finally об удалении контейнера первой попытки, но финальное примечание в 006-checks.txt уточняет: тогда контейнер не создавался. Считать это отдельным успешным cleanup нельзя.

## Автоматические тесты с подменой БД/сети

| Дата / этап                     | Обычный pnpm test                                | Отдельно реальная БД           | Источник                                                     |
| ------------------------------- | ------------------------------------------------ | ------------------------------ | ------------------------------------------------------------ |
| 17.11, № 005                    | 340 = 277 shared + 30 web + 33 API               | 4 успешных DB-теста            | [005-checks.txt](../evidence/005-checks.txt)                 |
| 17.11, № 006                    | 361 = 277 shared + 51 web + 33 API               | 4 успешных DB-теста, браузер   | [006-checks.txt](../evidence/006-checks.txt)                 |
| 20.11, регрессии до исправления | Frontend 39 ожидаемых падений + 58 успешных = 97 | Не запускались                 | [Лог исправления](../evidence/006-error-handling-checks.txt) |
| 20.11, исправленный № 006       | 407 = 277 shared + 97 web + 33 API               | Заново не запускались локально | [Лог исправления](../evidence/006-error-handling-checks.txt) |

Обычные API-тесты: 21 prepareQuiz, 7 HTTP с mock Prisma, 4 конфигурации и 1 health. Frontend 97: App 30, prepareDraft 6, Workspace 19, API client 42. В числе 407 находятся 277 тестов shared и 30 тестов демоплеера из ПМ01: они повторно запускались для совместимости, а не разработаны в ПМ02. Новые результаты: 32 обычных API-теста в № 005 сверх существующего health, 21 frontend-тест в первоначальном № 006 и 46 регрессий исправления. Четыре DB-теста учитываются отдельно; повторные прогоны не суммируются как новые тесты.

JSON/пустое/HTML для 400/404/413/500/503 проверялись через fetch mock/Response. Они подтверждают клиентскую обработку, а не реальные отказы PostgreSQL. Отдельная проверка невалидного UUID/404/413 в API входит в HTTP mock-набор. Полного browser-сценария после исправления 20.11 нет. Подробнее: [debugging.md](debugging.md).

## Что подтверждено CI

GitHub API при подготовке комплекта подтвердил [CI #8](https://github.com/ValentineNam/hexlet-quiz-platform/actions/runs/44126089107) для 19833ed и [CI #9](https://github.com/ValentineNam/hexlet-quiz-platform/actions/runs/44777143948) для 67a11ad: completed/success, job check и шаги successful. Успешны frozen install, lint, typecheck, Prisma validate/migrate, test:integration, обычные test, build и format:check. Это независимые от локальных логов статусы удалённых шагов с PostgreSQL service. В workflow нет браузера и git diff --check. Числа 340/407 взяты из локальных логов, не приписываются выводам CI: stdout job не скачивался. Снимок метаданных и источники — [реестр](evidence-index.md).

## Остаточные ограничения

Нет auth/owner, серверной игры, production proxy, идемпотентности POST, восстановления потерянного ID, таймаутов клиента, долговременного хранения черновика или теста реального сбоя БД посреди браузерной операции. Доступен только локальный opt-in API. Не проводились полный WCAG-аудит, screen reader, реальные смартфоны и нагрузочные измерения. Строковые ключи image хранятся без загрузки медиа. Эти ограничения не следует скрывать в заключении отчёта. Источники: [№ 005](../../../tasks/005-api-database-integration.md), [№ 006](../../../tasks/006-frontend-api-integration.md), [исправление](../evidence/006-error-handling-fix.md).
