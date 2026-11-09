# taskterm

> Обновлено: 2026-11-07

## Проект

Канбан-доски для команды в стиле терминала: несколько досок, свои колонки-этапы, задачи с описанием (markdown), ответственным, дедлайном, подзадачами-чеклистом и комментариями; живые обновления (SSE) и уведомления в браузере. Локальное рабочее приложение; заменяет taigaUI и обсуждение задач в Telegram.

- Стек: pnpm-монорепо. `apps/api` — Fastify 5 + zod (`fastify-type-provider-zod`) + Drizzle ORM + PostgreSQL (`postgres`; в тестах встроенный pglite). `apps/web` — React 19 + Vite + TanStack Query (данные сервера) + Zustand (только UI-состояние) + react-router + dnd-kit + Tailwind v4. `packages/shared` — zod-схемы и общие типы/парсеры (экспортирует TS-исходники, не собирается).
- Решено остаться на Fastify + Drizzle (NestJS/Prisma обсуждали, переход не нужен).
- В работе: роли/инвайты/JWT/админка/права задач — план и прогресс в `docs/PLAN_ROLES_PG.md` (сделаны все этапы 0–7: git, Postgres, JWT, роли на досках, инвайты, права задачи, админ-панель, Docker/HTTPS/бэкап).
- Прод: compose из двух контейнеров — `app` (API раздаёт собранный фронт) и `db` (Postgres 17, том `taskterm-pg`); профиль `https` добавляет Caddy (`deploy/Caddyfile`, `DOMAIN`); бэкап — `scripts/backup.sh` (cron). Инструкции: полная `docs/DEPLOY.md`; короткая для тимлида `docs/DEPLOY_SHORT.md` и `docs/deploy.html` (запуск через Docker, nginx тимлид настраивает сам на хосте: proxy на `127.0.0.1:APP_PORT`, `proxy_buffering off` для SSE, `Host` как есть); `README.md`. Всё прод-конфигурируется через `.env` (шаблон `.env.example` разбит на блоки: обязательное / админ / сеть / Telegram / Caddy / только dev).
- Фичи на потом: `docs/FEATURES_LATER.md`. Разбор бэкенда для человека из NestJS/Prisma: `docs/ONBOARDING_BACKEND.md`.
- Папка `promo/` — отдельный проект: промо-видео (Motion Canvas). Не входит в workspace и в Docker-образ.
- Репозиторий под git (ветка `main`, `git init` сделан 2026-11-02).

## Запуск и проверка

```bash
pnpm install
cp .env.example .env      # JWT_SECRET, ADMIN_USERNAME; локальный .env уже есть (dev-значения)
docker compose -f docker-compose.dev.yml up -d   # dev-Postgres localhost:5442 (taskterm/taskterm)
pnpm dev                  # web http://localhost:5180 (strictPort), api :3100, прокси /api
pnpm test                 # api: 138 тестов (vitest + fastify.inject + pglite, 15–30 с), web: 6 (lib/dates)
pnpm typecheck
pnpm --filter @taskterm/api exec drizzle-kit generate   # новая миграция
docker compose up -d --build                            # прод-режим (+ `--profile https` для Caddy)
scripts/backup.sh                                       # pg_dump в backups/, чистка старше 14 дней
# переменные прод-режима: APP_PORT, APP_BIND, POSTGRES_PASSWORD, JWT_SECRET, ADMIN_USERNAME/PASSWORD, COOKIE_SECURE, TRUST_PROXY, DOMAIN
```

- Порты: 3100 api, 5180 web, 5442 dev-Postgres. 5173 занят чужим Vite-проектом, 3001 — Docker, поэтому порты нестандартные.
- Dev-БД: контейнер `taskterm-db-dev` (том `taskterm-pg-dev`); данные перенесены из старой SQLite скриптом `apps/api/scripts/sqlite-to-pg.ts`. Бэкап старой SQLite: `../taskterm-backups/app-2026-11-02.db` (вне репозитория). Есть тестовые пользователи (3).
- Старый `apps/api/data/app.db` больше не используется.
- Порт :3001 занят чужим Docker-проектом (freellmapi), не taskterm.
- Расширение Chrome (claude-in-chrome) в этой среде НЕ подключалось: UI проверялся только сборкой/typecheck/curl/тестами. Реальная проверка в браузере — за пользователем.
- pnpm 12: билд-скрипты нужно разрешать в `pnpm-workspace.yaml` (`allowBuilds`: esbuild; `better-sqlite3: false` — drizzle-orm тянет его как авто-peer, не используется).

## Конвенции

- Общаться по-русски. Технические термины/идентификаторы — как есть.
- Миграции Drizzle ТОЛЬКО добавлять (`drizzle-kit generate`, папка `apps/api/drizzle-pg`); не удалять и не перегенерировать старые. Сейчас `0000`–`0012` (Postgres). Старые SQLite `0000`–`0003` — архив в `drizzle-sqlite-archive`.
- БД-код асинхронный: `await` на все запросы Drizzle; один ряд — `first(rows)` из `db/client.ts` или деструктуризация `[row]`. Время в БД — `timestamptz`, наружу ISO-строка (`customType` в `schema.ts`); `dueDate` — `date` (`YYYY-MM-DD`). На фронте показывать время через `lib/dates.formatDateTime`.
- Номер задачи занимается атомарным `update boards set next_task_number = next_task_number + 1 returning`.
- Пути не хардкодить: API — `apps/web/src/consts/endpoints/*` (`API_ENDPOINTS`, префикс `API_BASE='/api'` добавляет клиент), роуты приложения — `consts/routes.ts` (`ROUTES`, `ROUTE_PATTERNS`). Стиль взят из `CommitteeWebSite/src/consts/endpoints`.
- UI-правила пользователя:
  - никаких нативных `<select>` и `confirm()` — только `components/Select.tsx` и `confirmDialog()` (`stores/confirm.ts`);
  - обычный текст нейтральный светлый; акцентный цвет только для кликабельного и важного (`btn`, `btn-primary`, `btn-danger`, `btn-active` в `index.css`);
  - у всего кликабельного `cursor: pointer`; у карточек `grab`/`grabbing`;
  - окна (theme, профиль, палитра) закрываются по клику вне и по Esc; кнопки действий — с рамкой.
- Состояние: серверные данные только в TanStack Query, Zustand — для UI (`stores/ui`, `theme`, `notifications`, `confirm`). Свои мутации инвалидируют кеш сами, чужие приходят по SSE (клиент пропускает события с `by === me`).
- Порядок карточек/колонок — дробные индексы (`fractional-indexing`); перенос: `POST /tasks/:id/move {columnId, beforeId|null}`, позицию считает сервер.
- Ошибки API — `{ error: string }`, `AuthError/NotFoundError/BadRequestError/ForbiddenError` с `status`.
- Пароли — scrypt (`node:crypto`). Авторизация — JWT: access (HS256, 15 мин, `jose`) в httpOnly-cookie `tt_access` + refresh (случайный токен, 30 дней) в cookie `tt_refresh` с path `/api/auth`, в БД только sha256 (`refresh_tokens`). Refresh ротируется; повторное предъявление ротированного токена (позже 10 с) гасит всю цепочку (`family_id`), в пределах 10 с — гонка вкладок, выдаётся только access. `users.token_version` в JWT (`ver`): смена роли/пароля/блокировка/`logout-all` → старые access сразу недействительны; `guard` на каждый запрос сверяет `is_active` и `ver` в БД. Клиент при 401 один раз вызывает `/auth/refresh` (`api/client.ts`), SSE при обрыве делает то же (`api/events.ts`). Регистрации на странице входа нет: только по приглашению (см. ниже), вход — логин+пароль. Cookie `Secure` только при `COOKIE_SECURE=true` (иначе по HTTP вход не работает).
- Безопасность auth: rate limit на login/register/refresh по IP (`AUTH_RATE_LIMIT_MAX`, 30/15 мин) + блокировка ip+логин после `LOGIN_FAIL_MAX` (8) неудач; CSRF — изменяющие запросы с чужим `Origin` → 403 (`ALLOWED_ORIGINS` для исключений); за proxy включать `TRUST_PROXY=true`.
- Права на доске (этап 3): `board_members(boardId,userId,role)`, роли `owner|editor|commenter|viewer`; матрица в `packages/shared/src/permissions.ts` (`roleCan`, `canDeleteTask`) — единая для сервера и клиента (клиент только блокирует кнопки, решает сервер). Сервер: `modules/permissions/access.ts` — `requireBoardCan/requireTaskCan/requireColumnCan/requireCommentBoard/requireSubtaskBoard`; админ приложения = owner на любой доске; не участнику — 404 (существование не раскрываем), участнику с малой ролью — 403. Новая доска → создатель owner. На доске всегда ≥1 owner. Ответственные (`task.assigneeIds`, несколько; `PATCH /tasks/:id {assigneeIds: []}` задаёт список целиком, `modules/tasks/assignees.ts` `withAssignees` добавляет их к задачам) — только участники доски; при удалении участника он снимается с задач доски; уведомление `assigned` получают только вновь добавленные. Доски и `myRole` приходят в `/api/boards` и `/api/boards/:id`; участники: `GET/PUT/DELETE /api/boards/:id/members[/:userId]` (UI — `components/MembersDialog.tsx`).
- Приглашения (этап 4): таблица `invites` (email, `token_hash` sha256, глобальная `role`, `board_grants` jsonb, `expires_at` 7 дней, `used_at`, `revoked_at`). API (`modules/invites`): `GET/POST /api/invites`, `POST /api/invites/:id/resend` («новая ссылка» — старое отзывается), `DELETE /api/invites/:id` — только админ; `GET /api/invites/check?token=` — публично (rate limit). Токен виден один раз, при создании. Регистрация: `POST /api/auth/register {token, username, password}` — приглашение «занимается» атомарно в транзакции с созданием пользователя (гонка двух регистраций → одна пройдёт; ник занят → ссылка остаётся живой); email берётся из приглашения; роль и доски из `board_grants` выдаются сразу; повторное приглашение на тот же email отзывает прежнее. Фронт: `pages/RegisterPage` (`/register?token=`), `pages/AdminPage` + `features/admin/InvitesPanel`. Первый админ — через `ADMIN_USERNAME`/`ADMIN_PASSWORD`.
- Права задачи (этап 5): `tasks.authorId` = owner задачи (передача: `POST /api/tasks/:id/owner {userId}`), `tasks.policy` jsonb (`lockTitle/lockDescription/lockAssignee/lockDueDate/lockMove/commentsLocked`, `subtasks: free|check_only|check_and_add`), `subtasks.created_by`. Правила — `packages/shared/src/policy.ts` (`canEditField/canAddSubtask/canChangeSubtask/canDeleteSubtask/canCommentOn/canManageTask`; вне режима `free` редактор меняет/удаляет только свои пункты (`created_by`)), сервер применяет в роутах tasks/subtasks/comments. Политику обходят владелец доски, админ и owner задачи (пока он editor+); менять её — они же: `PUT /api/tasks/:id/policy`. UI — `features/board/TaskRights.tsx`.
- Админ-панель (этап 6): `modules/admin` (`/api/admin/users|boards|audit`, `PATCH/DELETE /users/:id`, `POST /users/:id/reset-password`), `modules/audit` (`audit(db, actor, action, target, details)` → `audit_log`). Блокировка/смена роли → `tokenVersion++` (+отзыв refresh при блокировке) и `hub.kick(userId)` закрывает SSE. Последнего активного админа понизить/заблокировать/удалить нельзя. Сброс пароля: одноразовая ссылка 24 ч (`password_resets`), страница `/reset?token=`, публичные `GET /api/auth/reset/check`, `POST /api/auth/reset`. Удаление пользователя — с `transferTo` (доски, задачи, комментарии, приглашения переходят получателю). UI: `pages/AdminPage` + `features/admin/*`.
- Telegram (`modules/telegram`): бот на long polling (`getUpdates`, без вебхука) стартует в `onReady`, если задан `TELEGRAM_BOT_TOKEN`; ровно один процесс на токен (иначе 409). Привязка: профиль → `POST /api/telegram/link` → `t.me/<бот>?start=<одноразовый код 10 мин>` → `/start <код>` в боте → `users.telegram_chat_id`; `/stop` отвязывает. Уведомления — подписка на события `notify` шины (комментарии, назначения) → только привязанным, активным и участникам доски; 403 от Telegram снимает привязку. Тесты подменяют клиент (`buildApp(config, { telegram: fake })`), `vitest.config.ts` обнуляет токен. UI — `components/TelegramSection.tsx` в меню профиля.
- Защищённые доски: `boards.managed_by_admin`. Доска, созданная админом (из вкладки «доски» админки `POST /api/admin/boards` или обычным `POST /api/boards`), создаётся защищённой: `manageBoard` (название, удаление, колонки, участники) — только у админов, даже владелец-участник не может; работа с задачами не ограничена; выйти с доски участник может. В `Board` приходят `managedByAdmin` и `canManage` (роль + защита) — UI скрывает кнопки по `canManage`. Админ включает/снимает защиту `PATCH /api/admin/boards/:id`. Проверка — в `requireBoardCan`.
- Таймер работы (`modules/time`): работа хранится ОТРЕЗКАМИ в `time_entries` (пауза закрывает отрезок, продолжение открывает новый; `ended_at=null` — идёт, частичный unique-индекс: один открытый на пользователя). `work_timers` — текущий запуск (status running/paused, нет строки = остановлен). `app_settings` — ставка/валюта (`time.rate`, `time.currency`; по умолчанию 10 `$`, одна на всех, сумма по ТЕКУЩЕЙ ставке). Время всегда серверное; `startedAt`/`endedAt` можно задать вручную («забыл запустить»): не в будущем, не старше 14 дней, пересечения со своими записями → 409. Без задачи описание (`note`) обязательно. Границы дней/периодов — `TIME_ZONE` (.env, по умолчанию Europe/Moscow), хелперы `modules/time/tz.ts` (Intl, без библиотек). Периоды отчёта — `resolvePeriod` в shared (`payout` = текущая половина месяца, за которую копятся часы (до 15-го — 1–15, дальше — 16–конец); `periodTitle` даёт подпись «за ноябрь 2026, 1–15»). Отчёт/live/CSV/ставка — только админ (`/api/admin/time/*`); правки записей пишутся в `audit_log` (`time.add|edit|delete`), запись помечается `edited`. Удаление пользователя каскадно удаляет его записи.
- UI таймера: `components/WorkTimer.tsx` — панель `fixed` поверх всего закреплена ВСЕГДА (в т.ч. остановленный: `00:00:00`, кнопки `▶ continue` по последней задаче и `▶ new`); скрывается только крестиком (`stores/timer.hidden`, localStorage `taskterm.timer.hidden`), тогда в шапке кнопка возврата; запуск таймера снова показывает панель. «Последняя задача» — `TimerState.last` (сервер берёт из последней закрытой записи, `lastWork` в `modules/time/service.ts`, только для idle); раньше было так: остановлен — кнопка `▶ timer` в шапке; запущен/пауза: панель; каждые 30 мин работы — браузерное уведомление (если включён notify) + красная подсветка панели (только пока открыта вкладка). Диалоги старта/стопа — `WhenPicker` (сейчас/N мин назад/вручную), UI-стейт `stores/timer.ts`. Страницы: `pages/TimePage` (`/time`, мои часы), админка → вкладка «время» (`features/admin/TimePanel`). Кнопки периодов: к выплате, 1–15, 16–конец, месяц (+ произвольные даты). Выплаты: `time_payouts` (userId + период-половина месяца уникальны; хранит ms, ставку и валюту НА МОМЕНТ отметки — история не пересчитывается при смене ставки). Срок: 1–15 → 15-го, 16–конец → 1-го следующего (`payoutDueDate`, `duePayoutPeriods` в shared). API (админ): `GET/POST /api/admin/time/payouts`, `DELETE /payouts/:id`, `GET /payouts/due` (неоплаченное при наступившем сроке, 8 последних периодов); отметить можно только с наступлением срока и если у человека есть часы; отчёт отдаёт `payout` по человеку, `payoutDue`, `today`; журнал `time.payout`/`time.payout.undo`. UI: статус в строке человека (✓ выплачено / ! не выплачено / срок), кнопки внутри раскрытой строки, блок «не выплачено», сворачиваемая «история выплат». В отчёте админки переключатель «люди» / «Проекты» (проект = доска): `TimeReport.projects` (доска → люди и задачи; работа без задачи — «(без проекта)»), csv `?view=projects`.
- Уведомления колонки: `columns.notify_on_enter` + `column_notify_users` (получатели — участники доски; чистятся при выходе с доски). Настройка — `PATCH /api/columns/:id {notifyOnEnter, notifyUserIds}` (только админ приложения; остальное в колонке — `manageBoard`), UI — колокольчик в заголовке колонки, виден только админу (`features/board/ColumnNotifyDialog.tsx`). Перенос задачи в другую колонку шлёт `notify` kind `moved` (`columnName`) получателям кроме переносящего → браузер + Telegram.
- Подзадачи: ограничения длины заголовка нет (в БД `text`); пакетная вставка списка — до 100 пунктов. Переименование — многострочный textarea (Enter сохраняет, Shift+Enter — перенос).
- Тесты создают пользователей через `src/test-utils.ts` (`signupUser`), минуя приглашения.
- SSE фильтруется по доскам (`modules/events/routes.ts`): события с `boardId` получают только участники (админ — все); `boards`/`members`/`users` доходят всем как сигнал «перезапроси». События `subtasks`/`comments` несут `boardId`.
- Dev: Vite-прокси с `changeOrigin: false` (иначе CSRF-проверка Origin vs Host отклоняет POST из браузера).
- Роль пользователя `users.role` (`admin|member`); первый админ — `ADMIN_USERNAME` (+`ADMIN_PASSWORD`, `ADMIN_EMAIL`) при старте, если админов нет (`modules/auth/bootstrap.ts`). `requireAdmin` в `guard.ts` — для будущей админки.
- Бэкенд собирается esbuild в один `dist/server.mjs` (pglite внешний и грузится лениво — только для тестов, `DATABASE_URL=:memory:`); пути миграций/статики задаются `MIGRATIONS_DIR` (`drizzle-pg`), `STATIC_DIR`.

## Архитектура

API (`apps/api/src`), модуль = `routes.ts` + `service.ts`, роуты закрыты `requireUser`:
- `app.ts` — `await buildApp(config)` (async: подключение и миграции БД), сборка Fastify, раздача SPA (`STATIC_DIR`), обработчик ошибок; `server.ts` — запуск и graceful shutdown.
- `db/schema.ts` — users (email, role, isActive, tokenVersion, lastLoginAt), refresh_tokens, boards, columns, tasks (dueDate `YYYY-MM-DD`), task_assignees (несколько ответственных: PK taskId+userId, каскад), comments, subtasks.
- `modules/auth` (+`guard.ts`), `boards` (доски+колонки), `tasks`, `comments`, `subtasks` (+bulk), `users` (список, цвет `/users/me/color`), `events` (SSE `/api/events`, in-memory `plugins/hub.ts`).
- Цвета пользователей: выдаются случайно максимально непохожими (`packages/shared/src/colors.ts`), смена отклоняется, если слишком похоже на чужой (409); `backfillUserColors` при старте.

Shared (`packages/shared/src`): `auth`, `boards` (+`dueDateSchema`), `comments`, `subtasks`, `events` (SSE-события: users/subtasks/boards/board/comments/time/notify), `time.ts` (схемы таймера, `resolvePeriod`, `formatDuration`), `checklist.ts` (`parseChecklist`: `- пункт`, `1.`, `- [x]` → пункты), `colors`.

Web (`apps/web/src`):
- `api/*` — хуки TanStack Query; `api/events.ts` — SSE + браузерные уведомления (получатели: автор задачи, исполнитель, прошлые комментаторы, назначенный).
- `pages/*` — Auth, Boards, Board, Layout (`HomePage.tsx`); `features/board/*` — BoardView (dnd, фильтры, хоткеи hjkl/n/Enter), KanbanColumn, TaskCard, TaskModal, Subtasks, Comments.
- `components/*` — Select, CommandPalette (Ctrl/Cmd+K), HelpOverlay (`?`), ConfirmDialog, ThemeSettings+PresetSelect (живое превью темы), ProfileMenu (цвет), UserTag, InlineAdd и др.
- `themes.ts` — пресеты (phosphor, amber, dracula, paper, solarized); `lib/dates.ts` — даты в локальном поясе.
- Дедлайн: задачи в ПОСЛЕДНЕЙ колонке считаются выполненными (просрочка не подсвечивается).

Promo (`promo/`): Motion Canvas, сцены `src/scenes/*.tsx`, общий набор `src/ui.tsx`. Звук: сцены пишут метки `mark(...)` → `audio/marks.json` → `audio/build.py` (голос macOS `say` Milena + синтез эффектов `audio/sfx.py`, без музыки). npm (не pnpm), Vite 5 закреплён, аудио-окружение `.venv-audio`. Команды — в `promo/README.md`.

## Текущая работа

Состояние: MVP полностью собран и покрыт тестами; сверх плана сделаны: назначение исполнителей и фильтры, цвета пользователей, подзадачи (в т.ч. ввод списка текстом), дедлайны, realtime + уведомления, хоткеи и палитра, Docker, инструкция деплоя, промо-видео с озвучкой (`promo/taskterm-promo.mp4`, 109.5 с).

## Открыто / TODO

- Не проверено глазами в браузере: таймер (панель, диалоги старта/стопа, `datetime-local`, 30-мин напоминания, мобильная ширина), вкладка «время» в админке, многострочное переименование подзадачи, UI под owner/editor, секция `rights` задачи, блокировка живого пользователя, `/reset`, Caddy с реальным доменом (логика покрыта API-тестами).
- Деплой делает тимлид на своём сервере (Docker + свой nginx): пока не проверено на реальном сервере. `.env.example` пропускает значения `change-me` для `JWT_SECRET`/`POSTGRES_PASSWORD` — проверки на старте нет (предложено добавить в `config.ts`, ответа не было). Репозиторий: remote не добавлен; `promo/` решить, исключать ли из git.
- Перед публикацией в интернет: включить профиль `https` (DOMAIN, COOKIE_SECURE, TRUST_PROXY, APP_BIND=127.0.0.1), cron на `scripts/backup.sh` + копия дампов на другую машину, второй админ.
- Нет: отправки писем (SMTP нет — приглашения и ссылки сброса админ пересылает сам), смены пароля самим пользователем, чистки просроченных приглашений, CI.
- Таймер: напоминания «вы ещё работаете?» только в открытой вкладке (серверных/Telegram нет); ставка одна для всех и пересчитывает прошлые периоды; кнопка `time` в шапке у всех (вкладку «мои часы» в админке пробовали и убрали).
- Напоминания о дедлайнах (нужен планировщик), перетаскивание подзадач, несколько ответственных — сделано (не проверено глазами в браузере: чипы + Select «+ добавить» в TaskModal, список на карточке).
- Промо-видео: сцена `login` переписана (без регистрации и ключа), но видео и озвучка не перерендерены — `taskterm-promo.mp4` показывает старый вход.
- Озвучка видео: голос Milena не прослушан автором (проверялось числами); если не понравится — запись диктором или другой TTS.
- Реплики видео читаются по-русски фонетически («тасктерм», «докер компоуз ап»).
