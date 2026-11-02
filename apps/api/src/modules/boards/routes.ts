import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiErrorSchema,
  boardFullSchema,
  boardMemberSchema,
  boardSchema,
  columnSchema,
  createBoardSchema,
  createColumnSchema,
  idParamSchema,
  setMemberRoleSchema,
  updateBoardSchema,
  updateColumnSchema,
} from '@taskterm/shared';
import type { Db } from '../../db/client';
import type { EventHub } from '../../plugins/hub';
import { audit } from '../audit/service';
import { requireUser } from '../auth/guard';
import { requireBoardCan, requireColumnCan } from '../permissions/access';
import * as svc from './service';

const memberParams = z.object({ id: z.coerce.number().int(), userId: z.coerce.number().int() });

export async function boardRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));

  const err = { 401: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema };

  r.get('/api/boards', { schema: { response: { 200: z.array(boardSchema) } } }, async (req) =>
    svc.listBoards(db, req.user),
  );

  r.post(
    '/api/boards',
    { schema: { body: createBoardSchema, response: { 201: boardSchema } } },
    async (req, reply) => {
      const board = await svc.createBoard(db, req.body.name, req.user.id);
      hub.emit({ type: 'boards', by: req.user.id });
      return reply.code(201).send(board);
    },
  );

  r.get(
    '/api/boards/:id',
    { schema: { params: idParamSchema, response: { 200: boardFullSchema, ...err } } },
    async (req) => {
      const role = await requireBoardCan(db, req.user, req.params.id, 'view');
      return svc.getBoardFull(db, req.params.id, role);
    },
  );

  r.patch(
    '/api/boards/:id',
    { schema: { params: idParamSchema, body: updateBoardSchema, response: { 200: boardSchema, ...err } } },
    async (req) => {
      const role = await requireBoardCan(db, req.user, req.params.id, 'manageBoard');
      const board = await svc.updateBoard(db, req.params.id, req.body.name, role);
      hub.emit({ type: 'boards', by: req.user.id });
      hub.emit({ type: 'board', boardId: board.id, by: req.user.id });
      return board;
    },
  );

  r.delete('/api/boards/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    await requireBoardCan(db, req.user, req.params.id, 'manageBoard');
    await svc.deleteBoard(db, req.params.id);
    await audit(db, req.user, 'board.delete', `board:${req.params.id}`);
    hub.emit({ type: 'boards', by: req.user.id });
    return reply.code(204).send();
  });

  r.post(
    '/api/boards/:id/columns',
    { schema: { params: idParamSchema, body: createColumnSchema, response: { 201: columnSchema, ...err } } },
    async (req, reply) => {
      await requireBoardCan(db, req.user, req.params.id, 'manageBoard');
      const col = await svc.createColumn(db, req.params.id, req.body.name);
      hub.emit({ type: 'board', boardId: col.boardId, by: req.user.id });
      return reply.code(201).send(col);
    },
  );

  r.patch(
    '/api/columns/:id',
    { schema: { params: idParamSchema, body: updateColumnSchema, response: { 200: columnSchema, ...err } } },
    async (req) => {
      await requireColumnCan(db, req.user, req.params.id, 'manageBoard');
      const col = await svc.updateColumn(db, req.params.id, req.body.name);
      hub.emit({ type: 'board', boardId: col.boardId, by: req.user.id });
      return col;
    },
  );

  r.delete('/api/columns/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    await requireColumnCan(db, req.user, req.params.id, 'manageBoard');
    const boardId = await svc.deleteColumn(db, req.params.id);
    hub.emit({ type: 'board', boardId, by: req.user.id });
    return reply.code(204).send();
  });

  // ── участники доски ──────────────────────────────────────────
  r.get(
    '/api/boards/:id/members',
    { schema: { params: idParamSchema, response: { 200: z.array(boardMemberSchema), ...err } } },
    async (req) => {
      await requireBoardCan(db, req.user, req.params.id, 'view');
      return svc.listMembers(db, req.params.id);
    },
  );

  // добавить участника или сменить роль
  r.put(
    '/api/boards/:id/members/:userId',
    {
      schema: {
        params: memberParams,
        body: setMemberRoleSchema,
        response: { 200: z.array(boardMemberSchema), 400: apiErrorSchema, ...err },
      },
    },
    async (req) => {
      const { id, userId } = req.params;
      await requireBoardCan(db, req.user, id, 'manageBoard');
      await svc.setMemberRole(db, id, userId, req.body.role);
      await audit(db, req.user, 'board.member', `board:${id}`, { userId, role: req.body.role });
      hub.emit({ type: 'members', boardId: id, by: req.user.id });
      return svc.listMembers(db, id);
    },
  );

  r.delete(
    '/api/boards/:id/members/:userId',
    { schema: { params: memberParams } },
    async (req, reply) => {
      const { id, userId } = req.params;
      // выйти с доски может сам участник; убрать другого — только владелец
      if (userId !== req.user.id) await requireBoardCan(db, req.user, id, 'manageBoard');
      else await requireBoardCan(db, req.user, id, 'view');
      await svc.removeMember(db, id, userId);
      await audit(db, req.user, 'board.member_remove', `board:${id}`, { userId });
      hub.emit({ type: 'members', boardId: id, by: req.user.id });
      hub.emit({ type: 'board', boardId: id, by: req.user.id });
      return reply.code(204).send();
    },
  );
}
