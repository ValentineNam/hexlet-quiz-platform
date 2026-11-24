# № 008a — память и shutdown: измерения до/после

Фактическая дата23.11.2026, Europe/Moscow. Источники: [before JSON](008a-memory-before.json), [after JSON](008a-memory-after.json), [PG JSON](008a-postgres-results.json), [первый PG JSON](008a-postgres-results-first.json), [необработанный лог](008a-checks.txt). Это новые действия008a; старые007/008 данные не заменены.

## Детерминированная проверка

readiness-lifecycle.test.ts наблюдает raw.then и возвращаемый derived.then: старая008 подписывалась именно на derived Promise. После единого дедлайна четыре волны32 probes обязаны не менять счётчик, не создавать timers/DB calls и возвращать ту же завершённую result Promise. После settle можно начать новую успешную проверку. Проверены late arrival, success/reject и deadline-first. Проверка не зависит от абсолютного heap или выбранного порога GC.

## Ограниченный эксперимент с GC

Node24.22.2 --expose-gc, scripts/diagnostics/008a-memory.cjs. После импорта compiled service (хеш в JSON) выполняются3×5000 probes при одном pending raw Promise. Deadline ускорен через microtask вместо реальных1500 мс. Каждый sample использует3 вызова global.gc. После release операция завершается и память снимается снова. Никаких HTTP/PostgreSQL запросов, CPU/RSS нагрузки БД или пользовательских данных в этом эксперименте нет.

| Probes / состояние | Heap до, MiB | Heap после, MiB | DB calls до/после | Raw subscriptions до/после | Derived subscriptions до/после |
| ------------------ | ------------ | --------------- | ----------------- | -------------------------- | ------------------------------ |
| 0                  | 8.602        | 8.602           | — / —             | — / —                      | — / —                          |
| 5000               | 10.033       | 8.533           | 1 / 1             | 1 / 1                      | 5001 / 0                       |
| 10000              | 11.521       | 8.530           | 1 / 1             | 1 / 1                      | 10001 / 0                      |
| 15000              | 13.024       | 8.530           | 1 / 1             | 1 / 1                      | 15001 / 0                      |
| operation settled  | 8.545        | 8.529           | 1 / 1             | — / —                      | — / —                          |

До: прирост после15000 около4,42 MiB и15001 derived subscription, освобождение после settle. После: raw subscription1, derived0 на всех шагах, роста с числом probes не наблюдается. Разница абсолютных baseline heap не является производительностью приложения. Модель/GC/JIT дают шум; это подтверждение конкретного retention path, не доказательство отсутствия любых утечек, не долгий soak и не throughput benchmark.

## Реальный PostgreSQL / HTTP

Скрипт scripts/diagnostics/008a-postgres.py: свой postgres17.6-alpine, quiz008a_test, 2CPU/512MiB, случайный пароль только в env, свободный фиксированный DB host port127.0.0.1. Node compiled main без DI-модификаций. Применена миграция, отдельно5 DB-тестов. Вначале POST201 с синтетикой, public JSON без isCorrect, DTO GET совпал. Пять DB-тестов запускались в двух успешных сериях, это один набор5, не10 различных тестов. Последний JSON — финальная версия очистки -v; первая серия сохранена отдельно.

Четыре paused волны по8: все503. Первая ждёт общий1500, поздние не ждут новую операцию. /health200 между волнами. После unpause ready200, старый GET не изменился, PID не перезапускался до первого обычного shutdown.

| Волна | N   | HTTP | min, мс  | max, мс  |
| ----- | --- | ---- | -------- | -------- |
| 1     | 8   | 503  | 1506.960 | 1507.992 |
| 2     | 8   | 503  | 2.241    | 4.211    |
| 3     | 8   | 503  | 1.375    | 2.703    |
| 4     | 8   | 503  | 1.869    | 3.859    |

Это прямые HTTP timings, не прямой счёт raw-подписок внутри реального процесса. Отсутствие роста подписок доказано отдельными deterministic tests и JS-моделью. Healthy /ready после восстановления: 3.341 мс.

## Четыре проверки shutdown

| Сценарий                                         | Сигнал  | Время, мс | Код subprocess | Watchdog markers | Остаточные дети |
| ------------------------------------------------ | ------- | --------- | -------------- | ---------------- | --------------- |
| healthy SIGTERM after readiness recovery         | SIGTERM | 3.875     | -15            | 0                | 0               |
| paused DB without readiness query                | SIGTERM | 3.816     | -15            | 0                | 0               |
| paused DB with pending readiness                 | SIGTERM | 5032.016  | 1              | 1                | 0               |
| restart after forced termination, healthy SIGINT | SIGINT  | 3.712     | -2             | 0                | 0               |

Обычный SIGTERM при здоровой БД и paused без незавершённой readiness сохранил graceful signal-exit. При pausedDB и pending /ready отправлены SIGTERM, затем SIGINT и повторный SIGTERM: deadline не продлён, code1 и marker1. PostgreSQL оставался paused до завершения API — fallback не зависел от unpause. Фактические~5,03 с меньше тестового предела6,5 с. После unpause новое приложение запущено на той же БД: ready200, старый GET200, новый POST201; обычный SIGINT завершил его без задержки5 с. Значения -15/-2 — Python-представление сигналов, не exit1 приложения.

Восстановление после force не доказывает успешность незавершённых записей: в этом сценарии pending была только readonly readiness. При настоящем прерывании POST результат может быть неизвестен. Все проверки касались собственных процессов; ps потомки до/после записаны вJSON. Prisma6 library engine в этой среде не создала отдельных дочерних процессов. Это не универсальное доказательство для любых engine/OS.

## Защита остальных lifecycle hooks и ограничения

Дополнительный child-process тест использует действительный Nest TestRoot с beforeApplicationShutdown, возвращающим вечный Promise, и свободный loopback listener. Смешанные сигналы вызывают hook один раз, process watchdog принудительно завершает child. Unit-тесты проверяют single deadline, один fallback, cleanup и отсутствие timers при install/dispose.

Проверена только асинхронная остановка при живом event loop. Синхронный dead loop/blocking native code может не дать JS timer выполниться; для hard OS deadline нужен внешний supervisor. Дедлайн5000 выбран как локальная политика с запасом более3× readiness1500; production grace period нужно согласовывать с ожидаемой длительностью запросов. Незавершённые операции могут быть оборваны forced-exit. Readiness сохраняет false до фактического settle; при вечном blackhole нужна операторская перезагрузка/восстановление, которая теперь ограничена по времени. Непрерывный нагрузочный/CPU/heap soak и все другие сигналы/ОС не тестировались. Другие стандартные сигналы обслуживает прежний Nest механизм.
