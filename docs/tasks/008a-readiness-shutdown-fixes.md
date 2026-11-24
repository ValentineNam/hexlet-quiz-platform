# № 008a — исправления readiness и ограниченный shutdown

ПМ04, фактическая дата 23.11.2026, Europe/Moscow. Исходный main/aaaa635; перед началом существовали незакоммиченные №007/008. Их данные не удалены. Полный запрос получен из прикреплённого задания пользователя. Это продолжение исправления результатов аудита, №009 не начинается.

## Два дефекта и минимальная модификация

Исходная008 ограничивала число DB-операций одной, но создавала Promise.race и deadline для каждого HTTP-probe. При зависшей Prisma Promise завершённые HTTP-запросы оставляли реакции в pending chain. Отдельно NestJS shutdown мог ждать $disconnect без собственного конечного срока. Исторические008 измерения остаются в своих файлах, не заменяются результатами008a.

### Общий результат readiness

В ReadinessService хранится состояние с **одним result Promise**, который возвращается напрямую (без нового async wrapper). При первом вызове до запуска $transaction создаются состояние, resolver и один timer1500. Параллельные probes возвращают тот же result. Дедлайн разрешает его false, но сохраняет состояние до фактического завершения underlying DB-операции. Поздние probes получают уже разрешённый false без новых raw-обработчиков и таймеров. Одна пара success/rejection handlers установлена только при создании операции.

При завершении DB-операции timer очищается, результат разрешается, если ещё не завершён, и состояние освобождается по identity. Late success не может превратить уже выданный false в true; следующий probe начинает новую проверку. Синхронная ошибка клиента и Promise rejection до/после дедлайна становятся false без раскрытия деталей.

SQL и ограничения008 сохранены: SET LOCAL statement_timeout750 ms, SELECT1, transaction timeout1000/maxWait250. Таблицы не изменяются. /health, /ready, quizPOST/GET, bind127.0.0.1 и enable-флаг не меняют контракт. /ready по-прежнему404 при выключенном DB-модуле; при включённом — 200 ready или503 not_ready.

### Ограниченный shutdown поверх штатного Nest

[shutdown-watchdog.ts](../../apps/api/src/shutdown-watchdog.ts) наблюдает SIGTERM/SIGINT **перед** NestJS hooks. NestJS11.1.8 продолжает сам выполнять initialization/destroy/beforeShutdown/dispose/onApplicationShutdown и re-signal исходного сигнала. Watchdog не вызывает app.close и не запускает второй lifecycle.

Один общий deadline5000 ms начинается от первого сигнала, не продлевается повторным или смешанным сигналом. Observer использует prependOnceListener: к моменту стандартного Nest re-signal собственный listener исходного сигнала уже снят, иначе он помешал бы обычному завершению. Таймер unref не удерживает успешно закрывающийся процесс. Exit/dispose снимает оставшиеся собственные listeners/timer. Если startup listen отклоняется, main снимает установленный observer.

Если любой асинхронный hook не завершился, timer пишет только SHUTDOWN_DEADLINE и вызывает process.exit(1), а не выставляет один exitCode и не ждёт Promise.race вокруг disconnect. Это действительно завершает event loop/native engine при зависшем I/O. PrismaService обезличивает ошибку $disconnect перед возможным стандартным логированием Nest.

Пять секунд выбраны как небольшой локальный предел с запасом более3× readiness1500 и для обычных коротких запросов. В реальном стенде normal shutdown занял менее4 мс. Политика фиксирована, без новых переменных окружения/зависимостей. Это новый согласованный fallback для отказа, не обещание сохранить результат любого незавершённого POST. При force-exit код1; штатные SIGTERM/SIGINT сохраняют сигнал (Python -15/-2, shell обычно143/130). JS watchdog не гарантирует hard deadline при синхронной блокировке event loop; абсолютный предел требует внешнего supervisor. Другие сигналы сохраняют прежнее поведение Nest.

## Сначала регрессии, затем код

На собранном старом008 добавлены 8 тестов: 3 ожидаемых падения, 5 успешных. Это общий timer/result, поздний probe и child-process, не завершающийся без watchdog. Уточняющий before-run семи readiness-тестов дал2 падения/5 успешных, в том числе прямой рост счётчика subscriptions. [Лог](../practice/PM04/evidence/008a-checks.txt).

После исправления добавлены ещё6 watchdog/sanitization unit-тестов. Итого14 новых обычных тестов, старые008 сохранены. Child regression усилен до настоящего Nest beforeApplicationShutdown hook, который никогда не завершает Promise, с собственным свободным loopback-портом; mixed signals запускают hook один раз. Это отдельный процесс, cleanup всегда ограничен.

Тесты readiness используют fake timers, наблюдают .then raw Promise и его derived Promise (именно на derived подписывалась старая008), проверяют отсутствие новых реакций и таймеров после deadline, identity общего результата, поздний приход1400, success0/1499, deadline-first boundary и reject0/1600. Абсолютные heap thresholds не являются критерием прохождения тестов.

## Выполненные проверки

[Свидетельство](../practice/PM04/evidence/008a-audit-fixes.md), [память/shutdown](../practice/PM04/evidence/008a-memory-shutdown.md), [полный лог](../practice/PM04/evidence/008a-checks.txt), [реальные результаты PG](../practice/PM04/evidence/008a-postgres-results.json).

Эксперимент с GC до/после: 15000 модельных probes, одна DB-операция, microtask deadline вместо реальных1500 мс. Это ограниченный JS-эксперимент, не нагрузка PostgreSQL и не оценка production RSS. Счётчики служат детерминированной проверкой, heap — дополнительным наблюдением. Before выполнен на старом compiled service; хеши compiled JS сохранены отдельно.

Реальный PostgreSQL17.6 в своём контейнере/quiz008a_test: миграция, пять DB-тестов; четыре волны по8 /ready при pause; unpause и ready/GET без restart; здоровый SIGTERM; paused без pending; paused с pending и mixed signals; принудительное завершение; повторный запуск и POST/GET/ready; нормальный SIGINT. Deadline5000 с допуском1500 мс. Пользовательские volumes не использовались.

## Воспроизведение

```sh
nvm use
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm format:check
python3 scripts/diagnostics/008a-postgres.py --date 2026-11-23
git diff --check
# Только JS-модель после сборки текущей версии:
node --expose-gc scripts/diagnostics/008a-memory.cjs after 2026-11-23
```

Указывать фактическую дату. Скрипт пишет008a файлы, не007/008. Для сохранения новой отдельной PG-серии использовать --output; перед повтором не затирать исторический JSON без копии. Memory before нельзя заново запускать на исправленном коде и выдавать за прежнюю реализацию. Для воспроизведения before нужна исходная008, а не текущий рабочий service; сохранённый JSON содержит реальный старый compiled hash.

## Ограничения и аудит

Одна raw-операция всё ещё может жить дольше HTTP deadline при blackhole; новых подписок/SQL при этом не создаётся. Если она никогда не settle, readiness остаётся503 до её завершения или перезапуска API. Force-exit ограничивает остановку, но не является отменой отдельного SQL/восстановлением неизвестного результата POST. Проверены короткие bounded случаи, не длительный soak, production supervisor, CPU dead loop, непрерывная игровая нагрузка или все ОС. Коды/время сигналов получены на macOS. Внутренний timeout реального медленного SQL pg_sleep отдельно не тестировался.

README исправлен по текущему редактору006 с сохранением исторической оговорки005. Новых auth/WebSocket/игровых функций, миграций, зависимостей и формулы баллов нет. Commit/push не выполнялись.

## Полный перечень файлов именно № 008a

- `apps/api/src/database/readiness.service.ts`
- `apps/api/src/database/prisma.service.ts`
- `apps/api/src/main.ts`
- `apps/api/src/shutdown-watchdog.ts`
- `apps/api/test/readiness-lifecycle.test.ts`
- `apps/api/test/shutdown-process.test.ts`
- `apps/api/test/shutdown-watchdog.test.ts`
- `apps/api/test/startup.test.ts`
- `apps/api/package.json` (только test-script, версии/зависимости не меняются)
- `scripts/diagnostics/008a-memory.cjs`
- `scripts/diagnostics/008a-postgres.py`
- `README.md`
- `docs/tasks/008a-readiness-shutdown-fixes.md`
- `docs/practice/PM04/progress.md`
- `docs/practice/PM04/evidence/008a-audit-fixes.md`
- `docs/practice/PM04/evidence/008a-checks.txt`
- `docs/practice/PM04/evidence/008a-memory-shutdown.md`
- `docs/practice/PM04/evidence/008a-memory-before.json`
- `docs/practice/PM04/evidence/008a-memory-after.json`
- `docs/practice/PM04/evidence/008a-postgres-results.json`
- `docs/practice/PM04/evidence/008a-postgres-results-first.json`
- `docs/tasks/008-startup-readiness.md`
- `docs/practice/PM04/evidence/008-modification.md`
- `docs/practice/PM04/evidence/008-security-reliability.md`

Обычный API test-script теперь компилирует src перед Vitest: child-process проверяет актуальный compiled main и не зависит от оставшегося dist. На чистом checkout подготовка shared/Prisma остаётся прежней. Зависимости/lockfile не изменены.
