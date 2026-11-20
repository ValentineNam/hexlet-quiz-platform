# Архитектура интеграции ПМ02

Срез кода: main, 67a11ad; подготовлено 20.11.2026. Источники: [ТЗ](../../../requirements/TECHNICAL_SPEC_v1.0.md), [№ 005](../../../tasks/005-api-database-integration.md), [№ 006](../../../tasks/006-frontend-api-integration.md), [схема Prisma](../../../../apps/api/prisma/schema.prisma), [миграция](../../../../apps/api/prisma/migrations/202611170001_init_quizzes/migration.sql). Диаграммы показывают реализованный локальный сценарий, а не весь запланированный MVP.

## 1. Компоненты

```mermaid
flowchart LR
  User[Локальный пользователь] --> Workspace[React QuizWorkspace]
  Workspace --> Demo[App: локальный демоплеер]
  Workspace --> Editor[Форма создания и публичный просмотр]
  Editor --> Draft[prepareDraft]
  Draft --> Shared[shared: validateQuestion и контракты]
  Editor --> Client[quiz-api: fetch и проверка DTO]
  Client -->|HTTP /api/quizzes| Proxy[Vite dev proxy, loopback API]
  Proxy -->|POST или GET /quizzes| Controller[NestJS QuizzesController]
  Controller --> Service[QuizzesService]
  Service --> Prepare[prepareQuiz]
  Prepare --> Shared
  Service --> Prisma[PrismaService / Prisma Client]
  Prisma --> DB[(PostgreSQL 17.6)]
  Service --> Whitelist[Явный PublicQuizResponse без isCorrect]
```

Ответы проходят обратно через controller и proxy в fetch-клиент. Ветвь демоплеера не получает сохранённый квиз для оценивания. PrismaService подключается при инициализации включённого модуля и отключается при закрытии. ENABLE_QUIZ_API=false оставляет только /health; API слушает 127.0.0.1. Vite — локальный dev-proxy, а не production gateway. Источники: [main API](../../../../apps/api/src/main.ts), [AppModule](../../../../apps/api/src/app.module.ts), [PrismaService](../../../../apps/api/src/database/prisma.service.ts), [Vite](../../../../apps/web/vite.config.ts), [корень frontend](../../../../apps/web/src/main.tsx).

## 2. Создание квиза

```mermaid
sequenceDiagram
  actor U as Пользователь
  participant R as React / QuizWorkspace
  participant S as shared / validateQuestion
  participant V as Vite proxy
  participant A as NestJS
  participant P as Prisma
  participant D as PostgreSQL
  U->>R: Сохранить форму
  R->>S: Проверить вопросы, нормализовать
  S-->>R: Ошибки или Question[]
  alt Локальная ошибка
    R-->>U: Ошибки с полями, запрос не отправляется
  else Валидные данные
    R->>R: Синхронная блокировка повторного submit
    R->>V: POST /api/quizzes, CreateQuizRequest
    V->>A: POST /quizzes, body unknown
    A->>S: Повторная серверная валидация вопросов
    S-->>A: Нормализованные данные или ошибки
    alt Ошибка подготовки
      A-->>V: 400 INVALID_QUIZ
      V-->>R: Структурированные ошибки
      R-->>U: Сохранённый черновик и ошибки
    else Данные валидны
      A->>P: Один nested create
      Note over P,D: Атомарное создание Quiz + Question + AnswerOption
      P->>D: Запись связанных строк
      D-->>P: Результат
      P-->>A: Сохранённый квиз
      A->>A: Whitelist публичного DTO
      A-->>V: 201 PublicQuizResponse
      V-->>R: JSON
      R->>R: Проверка DTO и UUID v4
      R-->>U: ID, форма заблокирована после успеха
    end
  end
```

Повреждённый успешный ответ и сетевой сбой не подтверждают отсутствие записи. Клиент показывает предупреждение и не повторяет POST автоматически. Это не серверная идемпотентность. Источники: [форма](../../../../apps/web/src/QuizWorkspace.tsx), [клиент](../../../../apps/web/src/quiz-api.ts), [подготовка](../../../../apps/api/src/quizzes/prepare-quiz.ts), [сервис](../../../../apps/api/src/quizzes/quizzes.service.ts).

## 3. Получение квиза

```mermaid
sequenceDiagram
  actor U as Пользователь
  participant R as React
  participant V as Vite proxy
  participant A as NestJS
  participant P as Prisma
  participant D as PostgreSQL
  U->>R: Ввести ID, Получить квиз
  R->>R: Блокировка запроса, очистка старого просмотра
  R->>V: GET /api/quizzes/:id
  V->>A: GET /quizzes/:id
  A->>A: ParseUUIDPipe, UUID v4
  alt Неверный UUID
    A-->>V: 400
  else UUID корректен
    A->>P: findUnique с nested orderBy position asc
    P->>D: Чтение Quiz и дочерних строк
    D-->>P: Данные
    P-->>A: Quiz или null
    alt Записи нет
      A-->>V: 404 QUIZ_NOT_FOUND
    else Запись найдена
      A->>A: Явное исключение isCorrect и внутренних option UUID
      A-->>V: 200 PublicQuizResponse
    end
  end
  V-->>R: Ответ
  R->>R: Обработка статуса, проверка успешного DTO
  R-->>U: Данные без правильности либо понятная ошибка
```

Источник: [контроллер](../../../../apps/api/src/quizzes/quizzes.controller.ts), [сервис](../../../../apps/api/src/quizzes/quizzes.service.ts), [клиент](../../../../apps/web/src/quiz-api.ts). При ошибке БД сервис возвращает безопасный 503. /health — liveness, не самостоятельное доказательство доступности БД.

## 4. ER-диаграмма

```mermaid
erDiagram
  Quiz ||--o{ Question : contains
  Question ||--o{ AnswerOption : contains
  Quiz {
    uuid id PK
    varchar200 title
    text description
    varchar100 category
    timestamptz3 createdAt
  }
  Question {
    uuid id PK
    uuid quizId FK
    int position
    QuestionType type
    text text
    text image
    int timeLimitSeconds
    int maxPoints
  }
  AnswerOption {
    uuid id PK
    uuid questionId FK
    varchar256 key
    int position
    text text
    boolean isCorrect
  }
```

По [schema.prisma](../../../../apps/api/prisma/schema.prisma): image nullable; QuestionType = single/multiple; UUID создаёт Prisma. Question уникален по (quizId, position); AnswerOption — по (questionId, key) и (questionId, position). FK каскадно удаляют дочерние строки. key соответствует доменному ID варианта, id — внутренний UUID строки. Граф показывает 0..n на уровне БД; API дополнительно требует хотя бы один вопрос и 2–6 вариантов. CHECK миграции проверяют локальные диапазоны/содержимое, но не межстрочное число правильных вариантов. Полный CRUD, владельцы, игровые снимки, комнаты и авторизация в эту схему не входят.
