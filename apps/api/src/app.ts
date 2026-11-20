import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { z } from 'zod';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { healthResponseSchema } from '@taskterm/shared';
import type { Config } from './config';
import { createDb, type Db } from './db/client';
import { originAllowed } from './http';
import { ensureAdmin } from './modules/auth/bootstrap';
import { backfillUserColors } from './modules/users/colors';
import { authRoutes } from './modules/auth/routes';
import { userRoutes } from './modules/users/routes';
import { boardRoutes } from './modules/boards/routes';
import { eventRoutes } from './modules/events/routes';
import { EventHub } from './plugins/hub';
import { adminRoutes } from './modules/admin/routes';
import { inviteRoutes } from './modules/invites/routes';
import { commentRoutes } from './modules/comments/routes';
import { subtaskRoutes } from './modules/subtasks/routes';
import { createTelegramApi, type TelegramApi } from './modules/telegram/api';
import { createTelegramBot, type TelegramBot } from './modules/telegram/bot';
import { telegramRoutes } from './modules/telegram/routes';
import { attachmentRoutes } from './modules/attachments/routes';
import { chatRoutes } from './modules/chat/routes';
import { startChatJobs } from './modules/chat/jobs';
import { taskRoutes } from './modules/tasks/routes';
import { timeRoutes } from './modules/time/routes';

// сообщения валидации (zod) для пользователя — по-русски
z.config(z.locales.ru());

declare module 'fastify' {
  interface FastifyInstance {
    /** бот Telegram (null — токен не задан); нужен тестам */
    telegram: TelegramBot | null;
  }
}

/** Ошибка валидации fastify/zod `body/name Слишком маленькое…` → `поле «name»: слишком маленькое…` */
function humanize(message: string): string {
  const m = /^(?:body|querystring|params|headers)\/(\S*)\s+(.*)$/s.exec(message);
  if (!m) return message;
  return m[1] ? `поле «${m[1]}»: ${m[2]}` : m[2]!;
}

export async function buildApp(
  config: Config,
  opts: { logger?: boolean; /** подмена клиента Telegram (тесты); опрос бота при этом не запускается */ telegram?: TelegramApi } = {},
) {
  const app = Fastify({ logger: opts.logger ?? true, trustProxy: config.trustProxy }).withTypeProvider<ZodTypeProvider>();
  app.decorate('jwtSecret', config.jwtSecret);
  app.decorate('db', null as unknown as Db); // заполняется ниже, после подключения к БД
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(cookie);
  app.register(websocket, { options: { maxPayload: 16 * 1024 } }); // чат (WebSocket)
  // лимит включается только на роутах с config.rateLimit (login/register/refresh)
  app.register(rateLimit, { global: false });

  // CSRF: cookie-авторизация + SameSite=Lax; дополнительно изменяющие запросы с чужим Origin отклоняем
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (!originAllowed(req.headers, config.allowedOrigins)) return reply.code(403).send({ error: 'запрос с другого источника заблокирован' });
  });

  const { db, close } = await createDb(config.databaseUrl, config.migrationsDir);
  app.db = db;
  app.addHook('onClose', async () => {
    await close();
  });
  await backfillUserColors(db);
  await ensureAdmin(db, config, app.log);
  const hub = new EventHub();
  // Telegram: уведомления из шины событий + привязка через бота. Опрос запускается только на реальном клиенте.
  const tgApi = opts.telegram ?? (config.telegramBotToken ? createTelegramApi(config.telegramBotToken) : null);
  const bot = tgApi ? createTelegramBot({ db, api: tgApi, hub, publicUrl: config.publicUrl, log: app.log }) : null;
  app.decorate('telegram', bot);
  if (bot) {
    if (opts.telegram) bot.subscribeOnly();
    else app.addHook('onReady', async () => bot.start());
    app.addHook('onClose', async () => bot.stop());
  }

  app.get('/api/health', { schema: { response: { 200: healthResponseSchema } } }, async () => ({
    status: 'ok' as const,
    time: new Date().toISOString(),
  }));

  // продакшен: тот же процесс раздаёт собранный фронт, неизвестные пути отдают index.html (SPA)
  if (config.staticDir) {
    const root = resolve(config.staticDir);
    if (!existsSync(resolve(root, 'index.html'))) {
      throw new Error(`STATIC_DIR=${root}: index.html не найден`);
    }
    app.register(fastifyStatic, { root, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'не найдено' });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'не найдено' }));
  }

  app.setErrorHandler((error: Error & { status?: number; statusCode?: number }, req, reply) => {
    const status = error.status ?? error.statusCode ?? 500;
    if (status >= 500) req.log.error(error);
    return reply.code(status).send({ error: status >= 500 ? 'внутренняя ошибка сервера' : humanize(error.message) });
  });

  app.register(authRoutes, { db, config, hub });
  app.register(inviteRoutes, { db, config });
  app.register(adminRoutes, { db, hub });
  app.register(eventRoutes, { db, hub });
  app.register(userRoutes, { db, hub });
  app.register(boardRoutes, { db, hub, uploadsDir: config.uploadsDir });
  app.register(taskRoutes, { db, hub, uploadsDir: config.uploadsDir });
  app.register(attachmentRoutes, { db, hub, config });
  app.register(commentRoutes, { db, hub });
  app.register(subtaskRoutes, { db, hub });
  app.register(telegramRoutes, { db, config, bot });
  app.register(timeRoutes, { db, hub, config });
  app.register(chatRoutes, { db, hub, config });
  // сводки в Telegram и очистка по сроку хранения; в тестах таймер сводки короткий (config.chatDigestMs)
  let stopChatJobs: (() => void) | null = null;
  app.addHook('onReady', async () => {
    stopChatJobs = startChatJobs({ db, hub, bot, publicUrl: config.publicUrl, digestMs: config.chatDigestMs, log: app.log });
  });
  app.addHook('onClose', async () => stopChatJobs?.());
  return app;
}
