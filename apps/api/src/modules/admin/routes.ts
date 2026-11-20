import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  adminBoardSchema,
  adminUserSchema,
  auditEntrySchema,
  auditQuerySchema,
  createBoardSchema,
  deleteAdminUserSchema,
  chatSettingsSchema,
  idParamSchema,
  notifySettingsSchema,
  resetCreatedSchema,
  setRateSchema,
  updateAdminBoardSchema,
  updateAdminUserSchema,
} from '@taskterm/shared';
import type { Db } from '../../db/client';
import { errors } from '../../http';
import type { EventHub } from '../../plugins/hub';
import { listAudit } from '../audit/service';
import { requireAdmin, requireStaff } from '../auth/guard';
import { createAdminService } from './service';

/** Админ-панель: роуты для owner/admin/moderator; журнал, настройки и удаление — только owner/admin. Ошибки AdminError (со status) отдаёт общий обработчик. */
export async function adminRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireStaff(db));
  const admin = { preHandler: requireAdmin(db) };
  const svc = createAdminService(db);
  const err = errors(400, 401, 403, 404, 409);

  r.get('/api/admin/users', { schema: { response: { 200: z.array(adminUserSchema), ...err } } }, async (req) =>
    svc.listUsers(req.user),
  );

  r.put(
    '/api/admin/users/:id/rate',
    { schema: { params: idParamSchema, body: setRateSchema, response: { 200: adminUserSchema, ...err } } },
    async (req) => {
      const { user, events } = await svc.setRate(req.user, req.params.id, req.body.hourlyRate);
      hub.emitAll(events);
      return user;
    },
  );

  r.patch(
    '/api/admin/users/:id',
    { schema: { params: idParamSchema, body: updateAdminUserSchema, response: { 200: adminUserSchema, ...err } } },
    async (req) => {
      const { user, events, kick } = await svc.updateUser(req.user, req.params.id, req.body);
      kick.forEach((id) => hub.kick(id));
      hub.emitAll(events);
      return user;
    },
  );

  r.delete(
    '/api/admin/users/:id',
    { ...admin, schema: { params: idParamSchema, body: deleteAdminUserSchema, response: { 204: z.null(), ...err } } },
    async (req, reply) => {
      const { events, kick } = await svc.deleteUser(req.user, req.params.id, req.body.transferTo);
      kick.forEach((id) => hub.kick(id));
      hub.emitAll(events);
      return reply.code(204).send(null);
    },
  );

  r.post(
    '/api/admin/users/:id/reset-password',
    { schema: { params: idParamSchema, response: { 201: resetCreatedSchema, ...err } } },
    async (req, reply) => reply.code(201).send(await svc.createReset(req.user, req.params.id)),
  );

  r.get('/api/admin/boards', { schema: { response: { 200: z.array(adminBoardSchema), ...err } } }, async () =>
    svc.listBoards(),
  );

  r.post(
    '/api/admin/boards',
    { schema: { body: createBoardSchema, response: { 201: adminBoardSchema, ...err } } },
    async (req, reply) => {
      const { board, events } = await svc.createBoard(req.user, req.body.name);
      hub.emitAll(events);
      return reply.code(201).send(board);
    },
  );

  r.patch(
    '/api/admin/boards/:id',
    { schema: { params: idParamSchema, body: updateAdminBoardSchema, response: { 200: adminBoardSchema, ...err } } },
    async (req) => {
      const { board, events } = await svc.setBoardManaged(req.user, req.params.id, req.body.managedByAdmin);
      hub.emitAll(events);
      return board;
    },
  );

  r.get('/api/admin/notify-settings', { ...admin, schema: { response: { 200: notifySettingsSchema, ...err } } }, () => svc.getNotifySettings());

  r.put(
    '/api/admin/notify-settings',
    { ...admin, schema: { body: notifySettingsSchema, response: { 200: notifySettingsSchema, ...err } } },
    (req) => svc.setNotifySettings(req.user, req.body),
  );

  r.get('/api/admin/chat-settings', { ...admin, schema: { response: { 200: chatSettingsSchema, ...err } } }, () => svc.getChatSettings());

  r.put(
    '/api/admin/chat-settings',
    { ...admin, schema: { body: chatSettingsSchema, response: { 200: chatSettingsSchema, ...err } } },
    (req) => svc.setChatSettings(req.user, req.body),
  );

  r.get(
    '/api/admin/audit',
    { ...admin, schema: { querystring: auditQuerySchema, response: { 200: z.array(auditEntrySchema), ...err } } },
    async (req) => listAudit(db, req.query.limit, req.query.before),
  );
}
