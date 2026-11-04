# hexlet-quiz-platform

A real-time quiz platform developed as part of Hexlet College industrial internship (PM01, PM02, PM04).

Учебный проект Quiz Platform. Задача 001: каркас монорепозитория, стартовая страница и проверка работоспособности API. Полное ТЗ: [v1.0](docs/requirements/TECHNICAL_SPEC_v1.0.md). MIT-лицензия сохранена в LICENSE.

## Требования и запуск

Зафиксированы Node **24.22.2** (LTS) и pnpm **10.34.9**. Node 23 не поддерживается проектом. При установленном nvm переключите Node в текущем терминале (это не меняет системную установку):

```sh
nvm install
nvm use
corepack pnpm --version
```

Corepack должен быть установлен и поддерживать актуальные подписи pnpm. Все команды `pnpm` ниже также можно вызывать как `corepack pnpm`, без глобального `corepack enable`. Если Corepack отсутствует, установите pnpm 10.34.9 по официальной инструкции pnpm; установка глобальных инструментов не входит в bootstrap.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Frontend: http://127.0.0.1:5173. API: http://127.0.0.1:3000/health — HTTP 200, `{"status":"ok"}`. Остановка обоих процессов — Ctrl+C. Порты должны быть свободны. API не требует БД или `.env`.

## Проверки

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

`pnpm format` исправляет форматирование. Исходные ТЗ и задача исключены из форматирования, чтобы сохранить их содержание. CI выполняет frozen install и эти же пять проверок на Node из `.nvmrc`; секреты не нужны. После сборки API можно запустить командой `node apps/api/dist/main.js`, frontend проверить через `pnpm --filter @quiz/web exec vite preview --host 127.0.0.1`.

## Локальная PostgreSQL (не обязательна для каркаса)

Нужны Docker Compose и запущенный Docker Engine:

```sh
cp .env.example .env
# Замените POSTGRES_PASSWORD в .env своим локальным паролем.
docker compose config -q
docker compose up -d postgres
docker compose ps
docker compose exec postgres pg_isready -U quiz_local -d quiz_local
docker compose down
```

Если Docker CLI не обнаруживает плагин `compose`, используйте установленную отдельную команду `docker-compose` вместо `docker compose`. В проверенной среде доступна именно она.

БД `quiz_local`, пользователь `quiz_local`, порт `127.0.0.1:5432`. Данные сохраняются в volume `postgres_data`; `down` их не удаляет. Пример пароля не является действующим секретом. Не публикуйте `.env`. API пока не подключается к PostgreSQL.

## Структура и практика

- `apps/web` — React, Vite, Tailwind, TypeScript; тест стартовой страницы.
- `apps/api` — NestJS; HTTP-тест `/health` через Supertest.
- `packages/shared` — независимые модули [валидации вопросов](docs/tasks/002-question-validation.md) и [проверки ответов / начисления баллов](docs/tasks/003-answer-scoring.md).
- `docs/architecture`, `docs/design`, `docs/testing` — материалы соответствующих этапов.
- `docs/practice/PM01/progress.md` — фактический журнал; свидетельства в `evidence`.
- `docs/practice/PM02/evidence`, `docs/practice/PM04/evidence` — места для будущих фактических свидетельств.

Первый этап ПМ01 заканчивается 08.11.2026. Bootstrap не означает готовность всего ПМ01 или MVP. Авторизация, квизы, игровые алгоритмы, Prisma и деплой в задачу 001 не входят.
