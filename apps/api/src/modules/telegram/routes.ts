import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { apiErrorSchema, telegramLinkSchema, telegramStatusSchema } from '@taskterm/shared';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import { requireUser } from '../auth/guard';
import type { TelegramBot } from './bot';
import { createLinkCode, isLinked, unlinkUser } from './service';

export async function telegramRoutes(app: FastifyInstance, opts: { db: Db; config: Config; bot: TelegramBot | null }) {
  const { db, bot } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));
  const err = { 401: apiErrorSchema, 404: apiErrorSchema, 503: apiErrorSchema };

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
    linked: await isLinked(db, req.user.id),
  }));

  r.post('/api/telegram/link', { schema: { response: { 201: telegramLinkSchema, ...err } } }, async (req, reply) => {
    if (!bot) return reply.code(404).send({ error: 'telegram is not configured' });
    const name = await botName();
    if (!name) return reply.code(503).send({ error: 'telegram is unavailable' });
    const { code, expiresAt } = await createLinkCode(db, req.user.id);
    return reply.code(201).send({ url: `https://t.me/${name}?start=${code}`, expiresAt });
  });

  r.delete('/api/telegram', { schema: { response: { 204: z.null(), 401: apiErrorSchema } } }, async (req, reply) => {
    await unlinkUser(db, req.user.id);
    return reply.code(204).send(null);
  });
}
