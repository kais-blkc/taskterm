# Бэкенд taskterm: разбор для человека из NestJS + Prisma

> Обновлено: 2026-11-03. Стек: Fastify 5 + zod + Drizzle ORM + PostgreSQL. Решение остаться на нём принято (NestJS/Prisma обсуждали, переход не нужен).

## Сопоставление с привычным

| NestJS + Prisma | У нас |
|---|---|
| `@Controller`, `@Get()` | `routes.ts`: `r.get('/путь', { schema }, handler)` |
| `@Injectable` сервис, DI | `service.ts`: обычные функции, `db` передаётся первым аргументом |
| DTO + `class-validator` | zod-схемы в `packages/shared`: ими проверяются запрос и ответ |
| Guards (`@UseGuards`) | `preHandler: requireUser(db)` и `requireAdmin(db)` |
| Interceptors, Pipes, фильтры исключений | хуки Fastify (`addHook`) и один обработчик ошибок в `app.ts` |
| `prisma.user.findMany(...)` | `db.select().from(users).where(...)`: почти SQL |
| `prisma migrate` | `drizzle-kit generate`, миграции — обычные `.sql` в `apps/api/drizzle-pg` |
| `@nestjs/event-emitter` | `EventHub` в `plugins/hub.ts` |
| `module.ts` | нет; модуль подключается строкой `app.register(...)` в `app.ts` |

Главное различие: Nest скрывает связку за декораторами и DI, здесь она явная. Читать код проще, если искать «кто кого вызывает», а не «какая магия это подключила».

## Карта проекта

```
packages/shared/     схемы zod, типы, права   ← общий язык фронта и бэка
apps/api/src/
  app.ts             сборка Fastify: плагины, хуки, подключение модулей
  db/schema.ts       таблицы Drizzle (аналог schema.prisma)
  modules/<имя>/     routes.ts + service.ts   ← аналог controller + service
  plugins/hub.ts     шина событий в памяти
apps/web/src/
  api/               хуки TanStack Query (запросы к API)
  features/, pages/  экраны и компоненты
```

В Nest модуль — это `controller + service + dto + module`. У нас два файла (`routes.ts`, `service.ts`), а DTO живёт в `shared`.

## Путь одного запроса: пользователь пишет комментарий

Номера строк могут сместиться, ориентируйтесь на имена.

**1. Клик «send» (фронт).** `features/board/Comments.tsx` вызывает `m.add.mutate(body)`. Мутация из `useCommentMutations` в `api/tasks.ts` делает `POST /api/tasks/:id/comments`. Функция `api()` из `api/client.ts` ходит с cookie; при 401 один раз обновляет токен и повторяет запрос.

**2. Схема входа (shared).** `commentBodySchema` в `packages/shared/src/comments.ts`: `{ body: string, 1–10000 символов }`. Роут подключает её в `schema: { body: ... }`, Fastify сам проверяет запрос и возвращает 400 при ошибке. Это замена `class-validator` и `ValidationPipe`. Типы запроса и ответа выводятся из той же схемы (`z.infer`), отдельные DTO не нужны.

**3. Роут (`modules/comments/routes.ts`).** В начале файла `r.addHook('preHandler', requireUser(db))`: аналог глобального `@UseGuards(AuthGuard)`. Хук читает JWT из cookie `tt_access`, сверяет с БД, что пользователь активен и версия токена совпадает, и кладёт `req.user`. Дальше обработчик:
- `requireTaskCan(db, req.user, taskId, 'comment')` проверяет роль на доске. Не участнику — 404, участнику с малой ролью — 403.
- `canCommentOn(task.policy, ...)` проверяет политику задачи. Если owner закрыл комментарии — 403.
- вызывает `svc.createComment(...)`.

Проверки лежат в `modules/permissions/access.ts`, а сами правила (матрица ролей и политика задачи) — в `packages/shared/src/permissions.ts` и `policy.ts`. Их использует и фронт, чтобы заблокировать кнопки. Решает всегда сервер.

**4. Сервис (`modules/comments/service.ts`).** Чистые функции вместо класса с DI: `createComment(db, taskId, authorId, body)`. `db` приходит аргументом. Запросы пишутся почти как SQL:

```ts
await db.insert(comments).values({ taskId, authorId, body }).returning({ id: comments.id });
```

Таблица описана в `db/schema.ts` через `pgTable(...)`, из неё же выводятся типы. Миграции генерирует `drizzle-kit generate` в `.sql`-файлы, их можно читать глазами.

**5. Событие.** После записи роут делает `hub.emit({ type: 'comments', boardId, taskId, by })` и ещё событие `notify` для получателей уведомления. `hub` (`plugins/hub.ts`) — самодельный pub/sub в памяти, ничего магического.

**6. Доставка другим.** Открытый SSE-канал `GET /api/events` (`modules/events/routes.ts`) подписан на `hub`, фильтрует события по доскам пользователя и пишет их в поток. Фронт в `api/events.ts` получает событие и делает `invalidateQueries`, список комментариев перезапрашивается. Свои события клиент пропускает (`by === me`).

**7. Telegram.** `modules/telegram/bot.ts` тоже подписан на `hub` и ловит `notify`: отправляет сообщение привязанным получателям, у которых есть доступ к доске.

## Что где искать

| Вопрос | Файл |
|---|---|
| Какие есть эндпоинты? | `modules/*/routes.ts` |
| Что можно роли X? | `packages/shared/src/permissions.ts` |
| Что запрещено политикой задачи? | `packages/shared/src/policy.ts` |
| Как устроены вход и токены? | `modules/auth/` (`guard.ts`, `service.ts`, `tokens.ts`) |
| Какие есть таблицы? | `db/schema.ts` |
| Как проверить поведение? | `*.test.ts` рядом с модулем |

## Три отличия от Nest, о которые легко споткнуться

1. **Нет DI-контейнера.** Зависимости передаются вручную: `db` и `hub` приходят из `app.ts` в каждый модуль. Минус — длиннее сигнатуры, плюс — сразу видно, кто что использует.
2. **Схема одна на всё.** Одна zod-схема проверяет запрос, описывает ответ (Fastify режет лишние поля) и даёт TS-тип. В Nest это три разные вещи.
3. **Ошибки — классы со статусом.** `ForbiddenError`, `NotFoundError` и другие бросаются обычным `throw`. Один обработчик в `app.ts` превращает их в `{ error: "..." }` с нужным кодом. Фильтров исключений нет.

## Как освоиться на проекте

1. Пройдите самый короткий модуль: `packages/shared/src/comments.ts`, потом `modules/comments/routes.ts`, потом `service.ts`.
2. Прочитайте `modules/permissions/access.ts`: как устроены проверки.
3. Прочитайте тесты `comments.test.ts` и `permissions.test.ts`: те же сценарии глазами пользователя API.
4. Возьмите маленькую задачу (поле или эндпоинт). Миграцию сгенерирует `drizzle-kit`, а проверит тест.
5. Выучите основы SQL (`select`, `join`, транзакции): для Drizzle они важнее, чем знание самого Drizzle, и пригодятся в любом стеке.

Команды: `pnpm test` (тесты api на встроенном Postgres pglite, Docker не нужен), `pnpm typecheck`, `pnpm --filter @taskterm/api exec drizzle-kit generate` (новая миграция). Остальные конвенции — в `CLAUDE.md`.

## Почему не NestJS + Prisma

Решение принято, кратко причины:
- Узкие места масштабирования не в фреймворке: SSE-шина, лимиты входа и опрос Telegram живут в памяти одного процесса. Чинится Redis pub/sub или Postgres `LISTEN/NOTIFY` на любом фреймворке.
- Prisma хуже ложится на нестандартные запросы проекта: атомарный `update … returning` для номера задачи, `FOR UPDATE` для защиты последнего админа, транзакции при регистрации по приглашению.
- Тесты идут на встроенном `pglite` без Docker; с Prisma потребовался бы настоящий Postgres.
- Переписывание затронуло бы все модули, права, JWT, инвайты, Telegram, SSE и все тесты.

Компромисс, если команда настаивает на NestJS: NestJS с адаптером Fastify, при этом Drizzle и общие zod-схемы остаются.
