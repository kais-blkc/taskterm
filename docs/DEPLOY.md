# Деплой taskterm

Приложение — два контейнера: `app` (Docker-образ, API сам раздаёт фронт) и `db` (PostgreSQL 17). Данные лежат в томе `taskterm-pg`. Нужен только Docker.

## 1. Сервер

Любая Linux-машина (VPS или сервер в офисе) с Docker и плагином compose:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # перелогиниться после этого
docker compose version             # должно работать
```

## 2. Код на сервере

Проект пока не под git, поэтому либо сначала `git init` и пуш в приватный репозиторий (потом `git clone` на сервере), либо копирование:

```bash
# с твоего компьютера, из папки taskterm
rsync -av --exclude node_modules --exclude .git --exclude data --exclude dist \
  --exclude promo --exclude .env ./ user@SERVER:/opt/taskterm/
```

Локальный `.env` НЕ копируем (в нём dev-пароль).

## 3. Настройка

```bash
cd /opt/taskterm
cp .env.example .env
nano .env
```

- `JWT_SECRET` — секрет подписи токенов, ≥ 32 символов: `openssl rand -base64 48`. Без него контейнер не стартует. При смене все пользователи выйдут из системы.
- `ADMIN_USERNAME` (+ `ADMIN_PASSWORD`, `ADMIN_EMAIL`) — первый админ: создаётся при старте, если в БД нет админов (или назначается существующий пользователь с таким логином).
- `TRUST_PROXY=true` — если перед приложением стоит Caddy/nginx (иначе лимит попыток входа считает по IP прокси).
- `POSTGRES_PASSWORD` — пароль БД (`openssl rand -base64 24`). Без него compose не запустится. Менять после первого старта нельзя без правки пароля внутри БД.
- `APP_PORT` — порт на сервере (по умолчанию 3100).
- `COOKIE_SECURE=false` при работе по обычному HTTP. `true` только за HTTPS, иначе войти не получится.

## 4. Запуск

```bash
docker compose up -d --build
docker compose ps                         # статус должен стать healthy
curl http://localhost:3100/api/health     # {"status":"ok",...}
docker compose logs -f                    # логи
```

Открой `http://SERVER:3100` и войди как админ (`ADMIN_USERNAME` / `ADMIN_PASSWORD`). Регистрации на странице входа нет: в разделе `admin` создай приглашения (email, роль, доступ к доскам) и отправь людям ссылки `/register?token=…`. Ссылка одноразовая, живёт 7 дней и показывается один раз — потеряешь, создай «новую ссылку». Почта сервером не отправляется: ссылку пересылаешь сам.

После первого входа смени `ADMIN_PASSWORD` в `.env` на что-то не используемое больше нигде или удали его: пароль нужен только для создания самого первого админа.
Контейнер перезапускается сам (`restart: unless-stopped`), миграции БД применяются при старте.

## 5. HTTPS (нужен для уведомлений в браузере)

Браузерные уведомления работают только на `localhost` или по HTTPS. Проще всего поставить Caddy на хост:

```bash
sudo apt install -y caddy
# /etc/caddy/Caddyfile
taskterm.example.com {
    reverse_proxy localhost:3100
}
sudo systemctl reload caddy
```

Домен должен указывать на сервер. Затем в `.env` поставь `COOKIE_SECURE=true`, а в `docker-compose.yml` ограничь порт локальным адресом (`'127.0.0.1:3100:3100'`), чтобы наружу приложение было видно только через Caddy. После правок: `docker compose up -d`.

## 6. Обновление

```bash
cd /opt/taskterm
# обнови код (git pull или повторный rsync), затем:
docker compose up -d --build
```

Данные в томе `taskterm-pg` сохраняются, новые миграции применяются сами.

## 7. Бэкап и восстановление

```bash
docker compose exec -T db pg_dump -U taskterm -Fc taskterm > taskterm-$(date +%F).dump
```

Контейнеры останавливать не нужно. Для регулярного бэкапа вынеси это в скрипт и добавь в cron (например, раз в ночь), старые дампы чисти. Восстановление — в `README.md`.

### Перенос данных со старой SQLite-версии

Если на сервере была версия на SQLite: подними новую версию с пустой БД, затем скопируй старый `app.db` на машину с исходниками и выполни `pnpm --filter @taskterm/api exec tsx scripts/sqlite-to-pg.ts app.db <postgres-url>` (для этого на время открой порт БД или запусти скрипт в контейнере с доступом к `db`). Сессии не переносятся — все входят заново.

## 8. Если что-то не работает

| Симптом | Причина |
|---|---|
| контейнер сразу падает | не заданы `POSTGRES_PASSWORD` или `JWT_SECRET` (`docker compose logs`) |
| в БД нет админа, войти нельзя | задай `ADMIN_USERNAME` + `ADMIN_PASSWORD` и перезапусти `app`: админ создастся при старте |
| логин проходит, но выкидывает обратно | `COOKIE_SECURE=true` при обычном HTTP |
| порт занят | поменяй `APP_PORT` в `.env` |
| нет уведомлений | нужен HTTPS (раздел 5) или `localhost` |
| страница не открывается извне | firewall: открой порт (`sudo ufw allow 3100/tcp`) |

## Безопасность

Регистрация только по приглашению, есть лимит попыток входа (по IP и по паре IP+логин), роли на досках и JWT с отзывом. Для выхода в интернет нужен HTTPS (раздел 5) и `COOKIE_SECURE=true`; пользователей, блокировку и журнал действий добавит админ-панель (этап 6 в `docs/PLAN_ROLES_PG.md`).
