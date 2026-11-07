import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { healthResponseSchema } from '@taskterm/shared';
import type { Config } from './config';
import { createDb, type Db } from './db/client';
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
import { taskRoutes } from './modules/tasks/routes';
import { timeRoutes } from './modules/time/routes';

declare module 'fastify' {
  interface FastifyInstance {
    /** бот Telegram (null — токен не задан); нужен тестам */
    telegram: TelegramBot | null;
  }
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
  // лимит включается только на роутах с config.rateLimit (login/register/refresh)
  app.register(rateLimit, { global: false });

  // CSRF: cookie-авторизация + SameSite=Lax; дополнительно изменяющие запросы с чужим Origin отклоняем
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    const origin = req.headers.origin;
    if (!origin) return; // не браузер (curl, тесты)
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return reply.code(403).send({ error: 'bad origin' });
    }
    if (host !== req.headers.host && !config.allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: 'cross-origin request blocked' });
    }
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
      return reply.code(404).send({ error: 'not found' });
    });
  }

  app.setErrorHandler((error: Error & { status?: number; statusCode?: number }, req, reply) => {
    const status = error.status ?? error.statusCode ?? 500;
    if (status >= 500) req.log.error(error);
    return reply.code(status).send({ error: status >= 500 ? 'internal error' : error.message });
  });

  app.register(authRoutes, { db, config, hub });
  app.register(inviteRoutes, { db, config });
  app.register(adminRoutes, { db, hub });
  app.register(eventRoutes, { db, hub });
  app.register(userRoutes, { db, hub });
  app.register(boardRoutes, { db, hub });
  app.register(taskRoutes, { db, hub });
  app.register(commentRoutes, { db, hub });
  app.register(subtaskRoutes, { db, hub });
  app.register(telegramRoutes, { db, config, bot });
  app.register(timeRoutes, { db, hub, config });
  return app;
}
