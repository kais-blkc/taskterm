import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  boardFullSchema,
  boardMemberSchema,
  boardSchema,
  columnSchema,
  createBoardSchema,
  createColumnSchema,
  moveColumnSchema,
  idParamSchema,
  setMemberRoleSchema,
  updateBoardSchema,
  updateColumnSchema,
} from '@taskterm/shared';
import type { Db } from '../../db/client';
import { errors } from '../../http';
import type { EventHub } from '../../plugins/hub';
import { removeFiles } from '../attachments/storage';
import { requireUser } from '../auth/guard';
import { createBoardService } from './service';

const memberParams = z.object({ id: z.coerce.number().int(), userId: z.coerce.number().int() });

/** Роуты тонкие: схема → сценарий из service → события в шину → ответ */
export async function boardRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub; uploadsDir: string }) {
  const { db, hub, uploadsDir } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));
  const svc = createBoardService(db);

  const err = errors(401, 403, 404);

  r.get('/api/boards', { schema: { response: { 200: z.array(boardSchema) } } }, async (req) =>
    svc.listBoards(req.user),
  );

  r.post(
    '/api/boards',
    { schema: { body: createBoardSchema, response: { 201: boardSchema } } },
    async (req, reply) => {
      const { board, events } = await svc.createBoard(req.user, req.body.name);
      hub.emitAll(events);
      return reply.code(201).send(board);
    },
  );

  r.get(
    '/api/boards/:id',
    { schema: { params: idParamSchema, response: { 200: boardFullSchema, ...err } } },
    async (req) => svc.getBoard(req.user, req.params.id),
  );

  r.patch(
    '/api/boards/:id',
    { schema: { params: idParamSchema, body: updateBoardSchema, response: { 200: boardSchema, ...err } } },
    async (req) => {
      const { board, events } = await svc.updateBoard(req.user, req.params.id, req.body.name);
      hub.emitAll(events);
      return board;
    },
  );

  r.delete('/api/boards/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    const { events, files } = await svc.deleteBoard(req.user, req.params.id);
    await removeFiles(uploadsDir, files);
    hub.emitAll(events);
    return reply.code(204).send();
  });

  r.post(
    '/api/boards/:id/columns',
    { schema: { params: idParamSchema, body: createColumnSchema, response: { 201: columnSchema, ...err } } },
    async (req, reply) => {
      const { column, events } = await svc.createColumn(req.user, req.params.id, req.body.name);
      hub.emitAll(events);
      return reply.code(201).send(column);
    },
  );

  r.patch(
    '/api/columns/:id',
    { schema: { params: idParamSchema, body: updateColumnSchema, response: { 200: columnSchema, ...err } } },
    async (req) => {
      const { column, events } = await svc.updateColumn(req.user, req.params.id, req.body);
      hub.emitAll(events);
      return column;
    },
  );

  r.post(
    '/api/columns/:id/move',
    { schema: { params: idParamSchema, body: moveColumnSchema, response: { 200: columnSchema, ...err } } },
    async (req) => {
      const { column, events } = await svc.moveColumn(req.user, req.params.id, req.body.beforeId);
      hub.emitAll(events);
      return column;
    },
  );

  r.delete('/api/columns/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    const { events, files } = await svc.deleteColumn(req.user, req.params.id);
    await removeFiles(uploadsDir, files);
    hub.emitAll(events);
    return reply.code(204).send();
  });

  // ── участники доски ──────────────────────────────────────────
  r.get(
    '/api/boards/:id/members',
    { schema: { params: idParamSchema, response: { 200: z.array(boardMemberSchema), ...err } } },
    async (req) => svc.listMembers(req.user, req.params.id),
  );

  // добавить участника или сменить роль
  r.put(
    '/api/boards/:id/members/:userId',
    {
      schema: {
        params: memberParams,
        body: setMemberRoleSchema,
        response: { 200: z.array(boardMemberSchema), ...errors(400, 401, 403, 404) },
      },
    },
    async (req) => {
      const { id, userId } = req.params;
      const { members, events } = await svc.setMemberRole(req.user, id, userId, req.body.role);
      hub.emitAll(events);
      return members;
    },
  );

  r.delete('/api/boards/:id/members/:userId', { schema: { params: memberParams } }, async (req, reply) => {
    const { id, userId } = req.params;
    hub.emitAll((await svc.removeMember(req.user, id, userId)).events);
    return reply.code(204).send();
  });
}
