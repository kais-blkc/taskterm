import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiErrorSchema,
  createInviteSchema,
  idParamSchema,
  inviteCheckSchema,
  inviteCreatedSchema,
  inviteSchema,
} from '@taskterm/shared';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import { errors } from '../../http';
import { requireStaff } from '../auth/guard';
import { createInviteService } from './service';

/** Приглашения: управление — только админ; проверка ссылки — публично (по токену) */
export async function inviteRoutes(app: FastifyInstance, opts: { db: Db; config: Config }) {
  const { db, config } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const svc = createInviteService(db);
  const admin = { preHandler: requireStaff(db) };
  const err = errors(401, 403, 404, 409);
  const limit = { config: { rateLimit: { max: config.authRateLimitMax, timeWindow: '15 minutes' } } };

  r.get('/api/invites', { ...admin, schema: { response: { 200: z.array(inviteSchema), ...err } } }, async () =>
    svc.listInvites(),
  );

  r.post(
    '/api/invites',
    { ...admin, schema: { body: createInviteSchema, response: { 201: inviteCreatedSchema, 400: apiErrorSchema, ...err } } },
    async (req, reply) => reply.code(201).send(await svc.createInvite(req.user, req.body)),
  );

  r.post(
    '/api/invites/:id/resend',
    { ...admin, schema: { params: idParamSchema, response: { 201: inviteCreatedSchema, ...err } } },
    async (req, reply) => reply.code(201).send(await svc.resendInvite(req.user, req.params.id)),
  );

  r.delete('/api/invites/:id', { ...admin, schema: { params: idParamSchema } }, async (req, reply) => {
    await svc.revokeInvite(req.user, req.params.id);
    return reply.code(204).send();
  });

  // публично: форма регистрации спрашивает, чья это ссылка и какой email к ней привязан
  r.get(
    '/api/invites/check',
    { ...limit, schema: { querystring: z.object({ token: z.string().min(1).max(200) }), response: { 200: inviteCheckSchema, 404: apiErrorSchema, 429: apiErrorSchema } } },
    async (req) => svc.checkInvite(req.query.token),
  );
}
