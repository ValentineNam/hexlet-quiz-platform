# Свидетельство модификации № 008

23.11.2026, Europe/Moscow, ПМ04. Исходный HEAD aaaa635, main. Незакоммиченные артефакты № 007 присутствовали при начале и не перезаписывались; журнал дополнен. Это новая модификация компонентов после исходных измерений, не переименование результатов № 007.

## Что изменено

[readPort](../../../../apps/api/src/startup-config.ts) проверяет непустую десятичную строку и диапазон1–65535, default undefined=3000. [main.ts](../../../../apps/api/src/main.ts) сообщает ошибку PORT отдельно, без самого значения; общая ошибка запуска/БД остаётся безопасной. Enable-флаг, loopback, body limit и startup DB-connect не менялись.

[ReadinessController](../../../../apps/api/src/database/readiness.controller.ts) и [ReadinessService](../../../../apps/api/src/database/readiness.service.ts) добавлены в текущий opt-in [QuizzesModule](../../../../apps/api/src/quizzes/quizzes.module.ts). GET /ready: 200 status=ready либо503 status=not_ready; при выключенном DB-модуле404. Health остаётся 200 status=ok, не обращается к БД.

Применяются maxWait250/transaction1000 ms, SET LOCAL statement_timeout750 ms и SELECT1. Внешний HTTP deadline1500 ms очищается в finally. Реально выполняющаяся операция не заменяется новой после HTTP timeout; конкурирующие probes разделяют её, ошибки/поздние ошибки сводятся к false. Это ограничение числа pending-операций, не обещание отмены сетевого запроса по Promise.race. При блокировке Node event loop возможна задержка сверх таймера. Таблицы не изменяются; локальная настройка statement timeout сбрасывается с транзакцией.

## Сначала воспроизведение

До изменения кода добавлены startup.test.ts (13 тестов) и readiness.test.ts (4). На старом API команда pnpm --filter @quiz/api test: exit1, **12 ожидаемых падений / 38 успешных**. Девять PORT-случаев видели неверное сообщение о БД; три readiness-сценария получали404. Тест default-ready404 и четыре корректных/default PORT уже проходили. [Полный лог](008-checks.txt).

После реализации: **50/50 обычных API-тестов**. Это прежние33 + 17 новых, без удаления тестов. Новый DB-тест добавлен к четырём существующим, итог5. Дефект диагностики показан не только helper-тестом: импортируется main с mock NestFactory; дополнительно фактический Node dist/main.js с PORT=abc выдаёт сообщение о PORT и exit1.

## Проверки после реализации, 23.11

- Frozen install, lint, typecheck, test, build, format:check, git diff --check — exit0. Обычных тестов424: shared277 + web97 + API50. Отдельно на настоящем PostgreSQL успешно5 DB-тестов.
- Новый собственный postgres:17.6-alpine / quiz008_test: миграция на пустую БД, status up to date, повтор deploy без pending. Только искусственные данные, случайный пароль в окружении; существующие volumes не подключались.
- Node24.22.2, pnpm10.34.9, macOS15.7.1 arm64, Apple M1 Pro/10 logicalCPU/16GiB. DockerVM2CPU/~1,91GiB; тестовая PostgreSQL2CPU/512MiB. SQL подтвердил17.6. Версии/команды заново получены в [логе](008-checks.txt), настройки стенда совпадают с №007.
- POST201/GET200, порядок/DTO, публичный ответ без isCorrect; существующие ошибки JSON400/UUID400/body413/валидация400 проверены повторно. Vite и proxy GET200. Сеть не расширялась; lsof/dockers port loopback.
- /ready healthy20 запросов200, p50=2,471/p95=3,808/max=8,034 мс. После stop503 за1,177 мс; от начала docker stop до ответа503 —0,130 с, включая остановку контейнера. Это активный probe, не автономный мониторинг.
- /health200 при stop; quizGET/POST503. После restart старый квиз совпал, новый POST201 и /ready200 без API restart. Старая привязка порта проверена явно.
- Pause собственного контейнера дал два503 примерно1508/1506 мс; health200. После unpause ready200 и исходный GET200. Данные не потеряны, итог312/624/2496 строк совпадает с ожидаемыми write-запросами; ready не добавлял строки.
- 600 измеряемых GET/POST, 600 успешны. Readiness/outage не включены в latency GET/POST. [Сравнение](008-before-after.md), [сырой JSON](008-results.json), [безопасность](008-security-reliability.md).

Браузерные визуальные проверки и новые скриншоты не проводились; UI не менялся. Длительное steady-state, saturation, readiness под одновременной тяжёлой нагрузкой, query-cancel при постоянном blackhole и поведение shutdown в таком состоянии не исследовались. Серверный SQL timeout проверен конфигурацией/обычной настоящей транзакцией, а не отдельным pg_sleep-сценарием. HTTP deadline дополнительно проверен на pausedDB и deferred mock.

## Воспроизводимость и изменения

[scripts/diagnostics/008-readiness.py](../../../../scripts/diagnostics/008-readiness.py) сохраняет hashes модифицированных исходников в JSON, так как HEAD ещё не содержит commit №008. Он использует методику007, но пишет только008 артефакты. Старые007 JSON/log/script не изменяются. После завершения собственные API/Vite остановлены, контейнер удалён через finally. Backend-контракты квизов, shared, формула, frontend, Prisma schema/SQL и зависимости не менялись. README дополнен только инструкциями PORT и диагностики.

Полный перечень файлов №008 приведён в задаче; отдельная запись добавлена в progress. Commit/push не выполнялись, №009 не начата.

## Историческое дополнение: аудит и исправление № 008a, 23.11.2026

Исходные результаты, кодовые hashes и ограничения № 008 выше сохранены. Независимый аудит обнаружил рост удерживаемых Promise-reactions при длительном зависании и отсутствие общего bounded shutdown. Исправления и новые измерения относятся к [№ 008a](../../../tasks/008a-readiness-shutdown-fixes.md), а не к исходному № 008. Старые008 JSON/log не являются hashes текущей исправленной реализации.
