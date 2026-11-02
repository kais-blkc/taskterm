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
import { LOCKED_MESSAGE, actorOf, requireSubtaskBoard, requireTaskCan } from '../permissions/access';
import { ForbiddenError } from '../permissions/access';
import { canAddSubtask, canChangeSubtask, canCheckSubtask } from '@taskterm/shared';
import * as svc from './service';

export async function subtaskRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));

  const err = { 401: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema };
  // подзадачи меняют счётчики на карточках (board) и список в открытой модалке (subtasks)
  type User = import('../auth/service').AuthUser;
  // отметка — всем, кто редактирует задачи; переименование/удаление — по политике задачи
  const guardSubtask = async (user: User, id: number, change: boolean) => {
    const { subtask, task, role } = await requireSubtaskBoard(db, user, id);
    const actor = actorOf(task, user, role);
    if (!canCheckSubtask(actor)) throw new ForbiddenError('not allowed for your role');
    if (change && !canChangeSubtask(task.policy, actor, subtask.createdBy, user.id)) throw new ForbiddenError(LOCKED_MESSAGE);
  };
  const guardAdd = async (user: User, taskId: number) => {
    const { task, role } = await requireTaskCan(db, user, taskId, 'editTask');
    if (!canAddSubtask(task.policy, actorOf(task, user, role))) throw new ForbiddenError(LOCKED_MESSAGE);
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
      await guardAdd(req.user, req.params.id);
      const { subtask, boardId } = await svc.createSubtask(db, req.params.id, req.body.title, req.user.id);
      changed(req.user.id, subtask.taskId, boardId);
      return reply.code(201).send(subtask);
    },
  );

  // пачкой: список из текста (одна транзакция, одно событие для остальных клиентов)
  r.post(
    '/api/tasks/:id/subtasks/bulk',
    { schema: { params: idParamSchema, body: bulkSubtasksSchema, response: { 201: z.array(subtaskSchema), ...err } } },
    async (req, reply) => {
      await guardAdd(req.user, req.params.id);
      const { subtasks, boardId } = await svc.createSubtasks(db, req.params.id, req.body.items, req.user.id);
      changed(req.user.id, req.params.id, boardId);
      return reply.code(201).send(subtasks);
    },
  );

  r.patch(
    '/api/subtasks/:id',
    { schema: { params: idParamSchema, body: updateSubtaskSchema, response: { 200: subtaskSchema, ...err } } },
    async (req) => {
      // переименование — «изменение пункта», одна отметка done — нет
      await guardSubtask(req.user, req.params.id, req.body.title !== undefined);
      const { subtask, boardId } = await svc.updateSubtask(db, req.params.id, req.body);
      changed(req.user.id, subtask.taskId, boardId);
      return subtask;
    },
  );

  r.delete('/api/subtasks/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    await guardSubtask(req.user, req.params.id, true);
    const { taskId, boardId } = await svc.deleteSubtask(db, req.params.id);
    changed(req.user.id, taskId, boardId);
    return reply.code(204).send();
  });
}
