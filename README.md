# taskterm

Канбан-доски с обсуждением задач в терминальном стиле. pnpm-монорепо: `apps/api` (Fastify + Drizzle + SQLite), `apps/web` (React + TanStack Query + Zustand), `packages/shared` (zod-схемы и общие типы).

## Разработка

```bash
pnpm install
cp .env.example .env     # задай ACCESS_PASSWORD
pnpm dev                 # web: http://localhost:5180, api: :3100
pnpm test                # тесты api
pnpm typecheck
```

Миграции: после правки `apps/api/src/db/schema.ts` → `pnpm --filter @taskterm/api exec drizzle-kit generate`.
Применяются автоматически при старте. Старые миграции не удалять и не перегенерировать — только добавлять новые.

## Запуск в Docker

```bash
cp .env.example .env     # обязательно задай ACCESS_PASSWORD
docker compose up -d --build
# http://localhost:3100  (порт: APP_PORT в .env)
```

- Один образ: API сам раздаёт собранный фронт.
- БД (SQLite) лежит в томе `taskterm-data` и переживает пересборку и обновление.
- Обновление: `git pull && docker compose up -d --build`.
- `COOKIE_SECURE=true` ставь только если перед приложением HTTPS. При `true` по обычному HTTP войти не получится: браузер не сохранит cookie.

### Бэкап и восстановление БД

```bash
# бэкап: останавливаем контейнер, чтобы файл БД был согласованным
docker compose stop
docker run --rm -v taskterm_taskterm-data:/data -v "$PWD":/backup busybox tar czf /backup/taskterm-backup.tgz -C /data .
docker compose start

# восстановление
docker compose stop
docker run --rm -v taskterm_taskterm-data:/data -v "$PWD":/backup busybox sh -c "rm -rf /data/* && tar xzf /backup/taskterm-backup.tgz -C /data"
docker compose start
```

## Доска идей

См. `docs/FEATURES_LATER.md`.
