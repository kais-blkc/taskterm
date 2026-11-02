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
import { audit } from '../audit/service';
import { requireAdmin } from '../auth/guard';
import * as svc from './service';

/** Приглашения: управление — только админ; проверка ссылки — публично (по токену) */
export async function inviteRoutes(app: FastifyInstance, opts: { db: Db; config: Config }) {
  const { db, config } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const admin = { preHandler: requireAdmin(db) };
  const err = { 401: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema, 409: apiErrorSchema };
  const limit = { config: { rateLimit: { max: config.authRateLimitMax, timeWindow: '15 minutes' } } };

  r.get('/api/invites', { ...admin, schema: { response: { 200: z.array(inviteSchema), ...err } } }, async () =>
    svc.listInvites(db),
  );

  r.post(
    '/api/invites',
    { ...admin, schema: { body: createInviteSchema, response: { 201: inviteCreatedSchema, 400: apiErrorSchema, ...err } } },
    async (req, reply) => {
      const { invite, token } = await svc.createInvite(db, req.user.id, req.body);
      await audit(db, req.user, 'invite.create', `invite:${invite.email}`, { role: invite.role, boards: invite.boards.length });
      return reply.code(201).send({ ...invite, token });
    },
  );

  r.post(
    '/api/invites/:id/resend',
    { ...admin, schema: { params: idParamSchema, response: { 201: inviteCreatedSchema, ...err } } },
    async (req, reply) => {
      const { invite, token } = await svc.resendInvite(db, req.params.id, req.user.id);
      await audit(db, req.user, 'invite.resend', `invite:${invite.email}`);
      return reply.code(201).send({ ...invite, token });
    },
  );

  r.delete('/api/invites/:id', { ...admin, schema: { params: idParamSchema } }, async (req, reply) => {
    await svc.revokeInvite(db, req.params.id);
    await audit(db, req.user, 'invite.revoke', `invite:${req.params.id}`);
    return reply.code(204).send();
  });

  // публично: форма регистрации спрашивает, чья это ссылка и какой email к ней привязан
  r.get(
    '/api/invites/check',
    { ...limit, schema: { querystring: z.object({ token: z.string().min(1).max(200) }), response: { 200: inviteCheckSchema, 404: apiErrorSchema, 429: apiErrorSchema } } },
    async (req) => svc.checkInvite(db, req.query.token),
  );
}
