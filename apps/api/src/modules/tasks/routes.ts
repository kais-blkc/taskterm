import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  createTaskSchema,
  idParamSchema,
  moveTaskSchema,
  taskSchema,
  updateTaskSchema,
} from '@taskterm/shared';
import type { Db } from '../../db/client';
import type { EventHub } from '../../plugins/hub';
import {
  canDeleteTask,
  canEditField,
  canManageTask,
  taskPolicySchema,
  transferOwnerSchema,
  type PolicyField,
} from '@taskterm/shared';
import { audit } from '../audit/service';
import { requireUser } from '../auth/guard';
import { ForbiddenError, LOCKED_MESSAGE, actorOf, requireBoardCan, requireTaskCan } from '../permissions/access';
import { columnMoveNotice } from '../boards/column-notify';
import * as svc from './service';

const sameSet = (a: number[], b: number[]) => {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
};

export async function taskRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));

  const err = { 400: apiErrorSchema, 401: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema };

  r.post(
    '/api/boards/:id/tasks',
    { schema: { params: idParamSchema, body: createTaskSchema, response: { 201: taskSchema, ...err } } },
    async (req, reply) => {
      await requireBoardCan(db, req.user, req.params.id, 'createTask');
      const task = await svc.createTask(db, req.params.id, req.user.id, req.body);
      hub.emit({ type: 'board', boardId: task.boardId, by: req.user.id });
      return reply.code(201).send(task);
    },
  );

  r.get(
    '/api/tasks/:id',
    { schema: { params: idParamSchema, response: { 200: taskSchema, ...err } } },
    async (req) => (await requireTaskCan(db, req.user, req.params.id, 'view')).task,
  );

  r.patch(
    '/api/tasks/:id',
    { schema: { params: idParamSchema, body: updateTaskSchema, response: { 200: taskSchema, ...err } } },
    async (req) => {
      const { task: before, role } = await requireTaskCan(db, req.user, req.params.id, 'editTask');
      // политика задачи: проверяем только поля, которые реально меняются
      const actor = actorOf(before, req.user, role);
      const b = req.body;
      const touched: PolicyField[] = [];
      if (b.title !== undefined && b.title !== before.title) touched.push('title');
      if (b.description !== undefined && b.description !== before.description) touched.push('description');
      if (b.assigneeIds !== undefined && !sameSet(b.assigneeIds, before.assigneeIds)) touched.push('assignee');
      if (b.dueDate !== undefined && b.dueDate !== before.dueDate) touched.push('dueDate');
      for (const f of touched) if (!canEditField(before.policy, actor, f)) throw new ForbiddenError(LOCKED_MESSAGE);
      const task = await svc.updateTask(db, req.params.id, req.body);
      hub.emit({ type: 'board', boardId: task.boardId, by: req.user.id });
      // назначили новых людей (не себя) — им уведомление
      const added = task.assigneeIds.filter((u) => !before.assigneeIds.includes(u) && u !== req.user.id);
      if (added.length) {
        hub.emit({
          type: 'notify',
          kind: 'assigned',
          by: req.user.id,
          recipients: added,
          boardId: task.boardId,
          taskId: task.id,
          taskNumber: task.number,
          taskTitle: task.title,
          authorName: req.user.username,
          snippet: '',
        });
      }
      return task;
    },
  );

  r.delete('/api/tasks/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    const { task, role } = await requireTaskCan(db, req.user, req.params.id, 'view');
    if (!canDeleteTask(role, task.authorId === req.user.id)) throw new ForbiddenError('not allowed for your role');
    const boardId = await svc.deleteTask(db, req.params.id);
    hub.emit({ type: 'board', boardId, by: req.user.id });
    return reply.code(204).send();
  });

  r.post(
    '/api/tasks/:id/move',
    { schema: { params: idParamSchema, body: moveTaskSchema, response: { 200: taskSchema, ...err } } },
    async (req) => {
      const { task: before, role } = await requireTaskCan(db, req.user, req.params.id, 'editTask');
      if (!canEditField(before.policy, actorOf(before, req.user, role), 'move')) throw new ForbiddenError(LOCKED_MESSAGE);
      const task = await svc.moveTask(db, req.params.id, req.body);
      hub.emit({ type: 'board', boardId: task.boardId, by: req.user.id });
      // перенос в другую колонку с включёнными уведомлениями («На проверке») — настроенным получателям
      if (task.columnId !== before.columnId) {
        const notice = await columnMoveNotice(db, task.columnId, req.user.id);
        if (notice) {
          hub.emit({
            type: 'notify',
            kind: 'moved',
            by: req.user.id,
            recipients: notice.recipients,
            boardId: task.boardId,
            taskId: task.id,
            taskNumber: task.number,
            taskTitle: task.title,
            authorName: req.user.username,
            snippet: '',
            columnName: notice.columnName,
          });
        }
      }
      return task;
    },
  );

  // политику меняет owner задачи, владелец доски или админ
  r.put(
    '/api/tasks/:id/policy',
    { schema: { params: idParamSchema, body: taskPolicySchema, response: { 200: taskSchema, ...err } } },
    async (req) => {
      const { task, role } = await requireTaskCan(db, req.user, req.params.id, 'view');
      if (!canManageTask(actorOf(task, req.user, role))) throw new ForbiddenError('only the task owner can change rights');
      const updated = await svc.setPolicy(db, task.id, req.body);
      await audit(db, req.user, 'task.policy', `task:${task.boardId}/#${task.number}`, req.body);
      hub.emit({ type: 'board', boardId: task.boardId, by: req.user.id });
      return updated;
    },
  );

  // передача владения: owner задачи, владелец доски или админ; новый owner — участник доски с правом редактировать
  r.post(
    '/api/tasks/:id/owner',
    { schema: { params: idParamSchema, body: transferOwnerSchema, response: { 200: taskSchema, ...err } } },
    async (req) => {
      const { task, role } = await requireTaskCan(db, req.user, req.params.id, 'view');
      if (!canManageTask(actorOf(task, req.user, role))) throw new ForbiddenError('only the task owner can transfer it');
      const updated = await svc.transferOwner(db, task.id, req.body.userId);
      await audit(db, req.user, 'task.owner', `task:${task.boardId}/#${task.number}`, { toUserId: req.body.userId });
      hub.emit({ type: 'board', boardId: task.boardId, by: req.user.id });
      return updated;
    },
  );
}
