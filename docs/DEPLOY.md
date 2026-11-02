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

## 5. HTTPS (нужен для Secure-cookie и уведомлений в браузере)

В compose есть готовый Caddy (профиль `https`): сам получает и продлевает сертификат Let's Encrypt. Нужен домен, указывающий на сервер, и открытые порты 80 и 443.

В `.env`:

```
DOMAIN=taskterm.example.com
COOKIE_SECURE=true
TRUST_PROXY=true
APP_BIND=127.0.0.1        # наружу приложение видно только через Caddy
```

```bash
docker compose --profile https up -d
docker compose logs -f caddy     # дождись «certificate obtained»
```

Открой `https://taskterm.example.com`. Без профиля `--profile https` Caddy не запускается и всё работает по HTTP, как в разделе 4. Если свой Caddy/nginx уже стоит на хосте, профиль не нужен: проксируй на `localhost:3100`, выставь `TRUST_PROXY=true`, `COOKIE_SECURE=true`.

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

Контейнеры останавливать не нужно. Для регулярного бэкапа есть `scripts/backup.sh` (дамп в `backups/`, старше 14 дней удаляются):

```bash
scripts/backup.sh                       # разовый запуск
crontab -e
15 3 * * * cd /opt/taskterm && scripts/backup.sh >> backups/backup.log 2>&1   # каждую ночь
```

Дампы лежат на том же сервере: периодически копируй их на другую машину (`rsync`/`scp`). Восстановление — в `README.md`.

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
| забыли пароль (в том числе админа) | другой админ: `admin` → «пользователи» → «сброс пароля», отправить ссылку. Единственный админ: задай в `.env` `ADMIN_USERNAME` нового пользователя + `ADMIN_PASSWORD` — он создастся админом при старте только если активных админов нет; иначе сбросить пароль через SQL невозможно, держи второго админа |
| страница не открывается извне | firewall: открой порт (`sudo ufw allow 3100/tcp`) |

## Безопасность

Регистрация только по приглашению, лимит попыток входа (по IP и по паре IP+логин), роли на досках и права задач, JWT с мгновенным отзывом (блокировка, смена роли и пароля закрывают сессии), CSRF-проверка Origin, журнал действий в `admin`. Для выхода в интернет: HTTPS (раздел 5), `COOKIE_SECURE=true`, `TRUST_PROXY=true`, ежедневный бэкап (раздел 7), второй админ на случай потери пароля.

Письма сервер не отправляет (SMTP не настроен): приглашения и ссылки сброса пароля админ пересылает сам. Отправка по почте — в `docs/FEATURES_LATER.md`.
