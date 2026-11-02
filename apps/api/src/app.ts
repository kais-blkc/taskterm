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
import { inviteRoutes } from './modules/invites/routes';
import { commentRoutes } from './modules/comments/routes';
import { subtaskRoutes } from './modules/subtasks/routes';
import { taskRoutes } from './modules/tasks/routes';

export async function buildApp(config: Config, opts: { logger?: boolean } = {}) {
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
  app.register(eventRoutes, { db, hub });
  app.register(userRoutes, { db, hub });
  app.register(boardRoutes, { db, hub });
  app.register(taskRoutes, { db, hub });
  app.register(commentRoutes, { db, hub });
  app.register(subtaskRoutes, { db, hub });
  return app;
}
