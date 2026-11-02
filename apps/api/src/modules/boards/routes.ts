import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiErrorSchema,
  boardFullSchema,
  boardSchema,
  columnSchema,
  createBoardSchema,
  createColumnSchema,
  idParamSchema,
  updateBoardSchema,
  updateColumnSchema,
} from '@taskterm/shared';
import type { Db } from '../../db/client';
import type { EventHub } from '../../plugins/hub';
import { requireUser } from '../auth/guard';
import * as svc from './service';

export async function boardRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));

  const err = { 401: apiErrorSchema, 404: apiErrorSchema };

  r.get('/api/boards', { schema: { response: { 200: z.array(boardSchema) } } }, async () =>
    await svc.listBoards(db),
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
    async (req) => svc.getBoardFull(db, req.params.id),
  );

  r.patch(
    '/api/boards/:id',
    { schema: { params: idParamSchema, body: updateBoardSchema, response: { 200: boardSchema, ...err } } },
    async (req) => {
      const board = await svc.updateBoard(db, req.params.id, req.body.name);
      hub.emit({ type: 'boards', by: req.user.id });
      hub.emit({ type: 'board', boardId: board.id, by: req.user.id });
      return board;
    },
  );

  r.delete('/api/boards/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    await svc.deleteBoard(db, req.params.id);
    hub.emit({ type: 'boards', by: req.user.id });
    return reply.code(204).send();
  });

  r.post(
    '/api/boards/:id/columns',
    { schema: { params: idParamSchema, body: createColumnSchema, response: { 201: columnSchema, ...err } } },
    async (req, reply) => {
      const col = await svc.createColumn(db, req.params.id, req.body.name);
      hub.emit({ type: 'board', boardId: col.boardId, by: req.user.id });
      return reply.code(201).send(col);
    },
  );

  r.patch(
    '/api/columns/:id',
    { schema: { params: idParamSchema, body: updateColumnSchema, response: { 200: columnSchema, ...err } } },
    async (req) => {
      const col = await svc.updateColumn(db, req.params.id, req.body.name);
      hub.emit({ type: 'board', boardId: col.boardId, by: req.user.id });
      return col;
    },
  );

  r.delete('/api/columns/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    const boardId = await svc.deleteColumn(db, req.params.id);
    hub.emit({ type: 'board', boardId, by: req.user.id });
    return reply.code(204).send();
  });
}
