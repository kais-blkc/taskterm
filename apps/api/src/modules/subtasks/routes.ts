import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiErrorSchema,
  bulkSubtasksSchema,
  createSubtaskSchema,
  idParamSchema,
  subtaskSchema,
  updateSubtaskSchema,
} from '@taskterm/shared';
import type { Db } from '../../db/client';
import type { EventHub } from '../../plugins/hub';
import { requireUser } from '../auth/guard';
import { requireSubtaskBoard, requireTaskCan } from '../permissions/access';
import { ForbiddenError } from '../permissions/access';
import { roleCan } from '@taskterm/shared';
import * as svc from './service';

export async function subtaskRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));

  const err = { 401: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema };
  // подзадачи меняют счётчики на карточках (board) и список в открытой модалке (subtasks)
  const editSubtask = async (user: import('../auth/service').AuthUser, id: number) => {
    const { role } = await requireSubtaskBoard(db, user, id);
    if (!roleCan(role, 'editTask')) throw new ForbiddenError('not allowed for your role');
  };
  const changed = (by: number, taskId: number, boardId: number) => {
    hub.emit({ type: 'subtasks', boardId, taskId, by });
    hub.emit({ type: 'board', boardId, by });
  };

  r.get(
    '/api/tasks/:id/subtasks',
    { schema: { params: idParamSchema, response: { 200: z.array(subtaskSchema), ...err } } },
    async (req) => {
      await requireTaskCan(db, req.user, req.params.id, 'view');
      return svc.listSubtasks(db, req.params.id);
    },
  );

  r.post(
    '/api/tasks/:id/subtasks',
    { schema: { params: idParamSchema, body: createSubtaskSchema, response: { 201: subtaskSchema, ...err } } },
    async (req, reply) => {
      await requireTaskCan(db, req.user, req.params.id, 'editTask');
      const { subtask, boardId } = await svc.createSubtask(db, req.params.id, req.body.title);
      changed(req.user.id, subtask.taskId, boardId);
      return reply.code(201).send(subtask);
    },
  );

  // пачкой: список из текста (одна транзакция, одно событие для остальных клиентов)
  r.post(
    '/api/tasks/:id/subtasks/bulk',
    { schema: { params: idParamSchema, body: bulkSubtasksSchema, response: { 201: z.array(subtaskSchema), ...err } } },
    async (req, reply) => {
      await requireTaskCan(db, req.user, req.params.id, 'editTask');
      const { subtasks, boardId } = await svc.createSubtasks(db, req.params.id, req.body.items);
      changed(req.user.id, req.params.id, boardId);
      return reply.code(201).send(subtasks);
    },
  );

  r.patch(
    '/api/subtasks/:id',
    { schema: { params: idParamSchema, body: updateSubtaskSchema, response: { 200: subtaskSchema, ...err } } },
    async (req) => {
      await editSubtask(req.user, req.params.id);
      const { subtask, boardId } = await svc.updateSubtask(db, req.params.id, req.body);
      changed(req.user.id, subtask.taskId, boardId);
      return subtask;
    },
  );

  r.delete('/api/subtasks/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    await editSubtask(req.user, req.params.id);
    const { taskId, boardId } = await svc.deleteSubtask(db, req.params.id);
    changed(req.user.id, taskId, boardId);
    return reply.code(204).send();
  });
}
