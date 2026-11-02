# Деплой taskterm

Приложение собирается в один Docker-образ: API сам раздаёт фронт, данные (SQLite) лежат в томе. Нужен только Docker.

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

- `ACCESS_PASSWORD` — общий ключ команды. Задай длинный: `openssl rand -base64 24`. Без него контейнер не стартует.
- `APP_PORT` — порт на сервере (по умолчанию 3100).
- `COOKIE_SECURE=false` при работе по обычному HTTP. `true` только за HTTPS, иначе войти не получится.

## 4. Запуск

```bash
docker compose up -d --build
docker compose ps                         # статус должен стать healthy
curl http://localhost:3100/api/health     # {"status":"ok",...}
docker compose logs -f                    # логи
```

Открой `http://SERVER:3100`, зарегистрируйся (нужен ключ доступа) и раздай ключ команде.
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

Данные в томе `taskterm-data` сохраняются, новые миграции применяются сами.

## 7. Бэкап и восстановление

```bash
docker compose stop
docker run --rm -v taskterm_taskterm-data:/data -v "$PWD":/backup busybox \
  tar czf /backup/taskterm-$(date +%F).tgz -C /data .
docker compose start
```

Для регулярного бэкапа вынеси это в скрипт и добавь в cron (например, раз в ночь). Восстановление — в `README.md`.

## 8. Если что-то не работает

| Симптом | Причина |
|---|---|
| контейнер сразу падает | не задан `ACCESS_PASSWORD` (`docker compose logs`) |
| логин проходит, но выкидывает обратно | `COOKIE_SECURE=true` при обычном HTTP |
| порт занят | поменяй `APP_PORT` в `.env` |
| нет уведомлений | нужен HTTPS (раздел 5) или `localhost` |
| страница не открывается извне | firewall: открой порт (`sudo ufw allow 3100/tcp`) |

## Безопасность

Лимита попыток входа пока нет, поэтому не выставляй приложение в открытый интернет напрямую. Держи его в локальной сети или за VPN, либо добавь защиту (rate limit) до публикации.
