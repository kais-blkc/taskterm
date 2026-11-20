import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { apiErrorSchema, telegramChatNotifySchema, telegramLinkSchema, telegramStatusSchema } from '@taskterm/shared';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import { errors } from '../../http';
import { requireUser } from '../auth/guard';
import type { TelegramBot } from './bot';
import { createTelegramService } from './service';

export async function telegramRoutes(app: FastifyInstance, opts: { db: Db; config: Config; bot: TelegramBot | null }) {
  const { db, bot } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));
  const svc = createTelegramService(db);
  const err = errors(401, 404, 503);

  const botName = async () => {
    try {
      return bot ? await bot.getUsername() : null;
    } catch {
      return null; // Telegram недоступен — статус всё равно отвечаем
    }
  };

  r.get('/api/telegram', { schema: { response: { 200: telegramStatusSchema, ...err } } }, async (req) => ({
    enabled: !!bot,
    botUsername: await botName(),
    linked: await svc.isLinked(req.user.id),
    chatNotify: await svc.chatNotifyOf(req.user.id),
  }));

  r.put(
    '/api/telegram/chat-notify',
    { schema: { body: telegramChatNotifySchema, response: { 200: telegramChatNotifySchema, 401: apiErrorSchema } } },
    async (req) => ({ enabled: await svc.setChatNotify(req.user.id, req.body.enabled) }),
  );

  r.post('/api/telegram/link', { schema: { response: { 201: telegramLinkSchema, ...err } } }, async (req, reply) => {
    if (!bot) return reply.code(404).send({ error: 'Telegram не настроен' });
    const name = await botName();
    if (!name) return reply.code(503).send({ error: 'Telegram недоступен' });
    const { code, expiresAt } = await svc.createLinkCode(req.user.id);
    return reply.code(201).send({ url: `https://t.me/${name}?start=${code}`, expiresAt });
  });

  r.delete('/api/telegram', { schema: { response: { 204: z.null(), 401: apiErrorSchema } } }, async (req, reply) => {
    await svc.unlinkUser(req.user.id);
    return reply.code(204).send(null);
  });
}
