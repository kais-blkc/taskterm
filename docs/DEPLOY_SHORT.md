# taskterm: запуск на сервере (кратко)

Два контейнера: `app` (API + собранный фронт, порт **3100**) и `db` (PostgreSQL 17, том `taskterm-pg`, наружу не публикуется). Nginx настраивается отдельно, на хосте.

Нужно: Docker + плагин compose (`docker compose version`).

## Запуск

```bash
cd /opt/taskterm            # куда загружен проект
cp .env.example .env
nano .env                   # см. таблицу ниже
docker compose up -d --build
docker compose ps           # app должен стать healthy
curl http://127.0.0.1:3100/api/health
```

Миграции БД применяются при старте, контейнеры перезапускаются сами (`restart: unless-stopped`).

## .env (минимум)

| Переменная | Значение |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` (без него не стартует) |
| `JWT_SECRET` | `openssl rand -base64 48`, ≥ 32 символов (без него не стартует) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | первый админ, создаётся при старте, если админов в БД нет |
| `APP_BIND` | `127.0.0.1`, если наружу только через nginx (по умолчанию `0.0.0.0`) |
| `APP_PORT` | порт на хосте (по умолчанию `3100`) |
| `TRUST_PROXY` | `true` за nginx (иначе IP клиента = IP прокси) |
| `COOKIE_SECURE` | `true`, если снаружи HTTPS; `false` при чистом HTTP (иначе вход не работает) |
| `PUBLIC_URL` | `https://домен`, для ссылок в Telegram (необязательно) |
| `TELEGRAM_BOT_TOKEN` | токен бота (необязательно). Опрашивать бота должен один экземпляр |

## Что нужно от nginx

Проксировать всё на `http://127.0.0.1:3100`. Для живых обновлений (SSE, `/api/events`) нужно отключить буферизацию:

```nginx
# в блоке http { } (один раз): нужно для WebSocket общего чата
map $http_upgrade $connection_upgrade { default upgrade; '' close; }

location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;          # WebSocket (чат, /api/chat/ws)
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 1h;
    client_max_body_size 60m;   # файлы к задачам до 50 МБ (по умолчанию nginx режет на 1 МБ)
}
```

`Host` должен передаваться как есть: приложение сверяет Origin с Host (защита от CSRF). Если домен для пользователя отличается от Host, добавь его в `ALLOWED_ORIGINS`.

## Первый вход

Открой сайт, войди как `ADMIN_USERNAME`. Регистрации на странице входа нет: в разделе `admin` создаются приглашения, ссылку `/register?token=…` админ отправляет человеку сам. После первого входа можно удалить `ADMIN_PASSWORD` из `.env`.

## Обновление

```bash
# обновить код, затем:
docker compose up -d --build
```

Данные в томе `taskterm-pg` сохраняются.

## Бэкап

```bash
scripts/backup.sh     # pg_dump в backups/, старше 14 дней удаляются
# cron: 15 3 * * * cd /opt/taskterm && scripts/backup.sh >> backups/backup.log 2>&1
```

## Если не работает

| Симптом | Причина |
|---|---|
| контейнер сразу падает | не заданы `POSTGRES_PASSWORD` или `JWT_SECRET` (`docker compose logs app`) |
| логин проходит, но выкидывает | `COOKIE_SECURE=true` при HTTP, либо nginx не передаёт `Host` |
| чат «нет связи» | в nginx не переданы `Upgrade`/`Connection` для WebSocket (см. конфиг выше) |
| нет живых обновлений | в nginx включена буферизация (`proxy_buffering off`) |
| 403 на POST/PATCH/DELETE | Origin не совпадает с Host: см. `ALLOWED_ORIGINS` |
| порт занят | поменяй `APP_PORT` |

Подробнее: `docs/DEPLOY.md`.
