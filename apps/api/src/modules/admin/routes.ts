import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  adminBoardSchema,
  adminUserSchema,
  apiErrorSchema,
  auditEntrySchema,
  auditQuerySchema,
  deleteAdminUserSchema,
  idParamSchema,
  resetCreatedSchema,
  updateAdminUserSchema,
} from '@taskterm/shared';
import type { Db } from '../../db/client';
import type { EventHub } from '../../plugins/hub';
import { audit, listAudit } from '../audit/service';
import { requireAdmin } from '../auth/guard';
import * as svc from './service';

/** Админ-панель: все роуты только для админа приложения */
export async function adminRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireAdmin(db));
  const err = { 400: apiErrorSchema, 401: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema, 409: apiErrorSchema };

  const guard = (reply: FastifyReply, e: unknown) => {
    if (e instanceof svc.AdminError) return reply.code(e.status as 400).send({ error: e.message });
    throw e;
  };

  r.get('/api/admin/users', { schema: { response: { 200: z.array(adminUserSchema), ...err } } }, async () => svc.listUsers(db));

  r.patch(
    '/api/admin/users/:id',
    { schema: { params: idParamSchema, body: updateAdminUserSchema, response: { 200: adminUserSchema, ...err } } },
    async (req, reply) => {
      try {
        const { before, after, sessionsClosed } = await svc.updateUser(db, req.user.id, req.params.id, req.body);
        if (sessionsClosed) hub.kick(after.id);
        hub.emit({ type: 'users', by: req.user.id });
        if (before.role !== after.role) await audit(db, req.user, 'user.role', `user:${after.username}`, { from: before.role, to: after.role });
        if (before.isActive !== after.isActive) await audit(db, req.user, after.isActive ? 'user.unblock' : 'user.block', `user:${after.username}`);
        const row = (await svc.listUsers(db)).find((u) => u.id === after.id)!;
        return row;
      } catch (e) {
        return guard(reply, e);
      }
    },
  );

  r.delete(
    '/api/admin/users/:id',
    { schema: { params: idParamSchema, body: deleteAdminUserSchema, response: { 204: z.null(), ...err } } },
    async (req, reply) => {
      try {
        const res = await svc.deleteUser(db, req.user.id, req.params.id, req.body.transferTo);
        hub.kick(req.params.id);
        hub.emit({ type: 'users', by: req.user.id });
        hub.emit({ type: 'boards', by: req.user.id });
        for (const boardId of res.boardIds) {
          hub.emit({ type: 'members', boardId, by: req.user.id });
          hub.emit({ type: 'board', boardId, by: req.user.id });
        }
        await audit(db, req.user, 'user.delete', `user:${res.username}`, { transferredTo: res.heir });
        return reply.code(204).send(null);
      } catch (e) {
        return guard(reply, e);
      }
    },
  );

  r.post(
    '/api/admin/users/:id/reset-password',
    { schema: { params: idParamSchema, response: { 201: resetCreatedSchema, ...err } } },
    async (req, reply) => {
      try {
        const { token, expiresAt, username } = await svc.createReset(db, req.user.id, req.params.id);
        await audit(db, req.user, 'user.reset_link', `user:${username}`);
        return reply.code(201).send({ token, expiresAt });
      } catch (e) {
        return guard(reply, e);
      }
    },
  );

  r.get('/api/admin/boards', { schema: { response: { 200: z.array(adminBoardSchema), ...err } } }, async () => svc.listBoards(db));

  r.get(
    '/api/admin/audit',
    { schema: { querystring: auditQuerySchema, response: { 200: z.array(auditEntrySchema), ...err } } },
    async (req) => listAudit(db, req.query.limit, req.query.before),
  );
}
