# taskterm

Канбан-доски с обсуждением задач в терминальном стиле. pnpm-монорепо: `apps/api` (Fastify + Drizzle + PostgreSQL), `apps/web` (React + TanStack Query + Zustand), `packages/shared` (zod-схемы и общие типы).

## Разработка

```bash
pnpm install
cp .env.example .env     # задай ACCESS_PASSWORD
docker compose -f docker-compose.dev.yml up -d   # Postgres на localhost:5442
pnpm dev                 # web: http://localhost:5180, api: :3100
pnpm test                # тесты api (встроенный Postgres pglite, Docker не нужен)
pnpm typecheck
```

Миграции: после правки `apps/api/src/db/schema.ts` → `pnpm --filter @taskterm/api exec drizzle-kit generate` (папка `apps/api/drizzle-pg`).
Применяются автоматически при старте. Старые миграции не удалять и не перегенерировать — только добавлять новые.
Старые SQLite-миграции лежат в `apps/api/drizzle-sqlite-archive` (архив, не применяются).

Перенос данных из старой SQLite-БД (один раз, в пустой Postgres):

```bash
pnpm --filter @taskterm/api exec tsx scripts/sqlite-to-pg.ts ./data/app.db
```

## Запуск в Docker

```bash
cp .env.example .env     # обязательно задай ACCESS_PASSWORD и POSTGRES_PASSWORD
docker compose up -d --build
# http://localhost:3100  (порт: APP_PORT в .env)
```

- Два контейнера: `app` (API раздаёт собранный фронт) и `db` (PostgreSQL 17, наружу порт не публикуется).
- БД лежит в томе `taskterm-pg` и переживает пересборку и обновление.
- Обновление: `git pull && docker compose up -d --build`.
- `COOKIE_SECURE=true` ставь только если перед приложением HTTPS. При `true` по обычному HTTP войти не получится: браузер не сохранит cookie.

### Бэкап и восстановление БД

```bash
# бэкап (контейнер можно не останавливать)
docker compose exec -T db pg_dump -U taskterm -Fc taskterm > taskterm-backup.dump

# восстановление в пустую БД
docker compose stop app
docker compose exec -T db psql -U taskterm -d postgres -c "drop database taskterm with (force)" -c "create database taskterm"
docker compose exec -T db pg_restore -U taskterm -d taskterm --no-owner < taskterm-backup.dump
docker compose start app
```

## Доска идей

См. `docs/FEATURES_LATER.md`.
