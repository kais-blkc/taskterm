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
import { requireUser } from '../auth/guard';
import * as svc from './service';

export async function taskRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));

  const err = { 400: apiErrorSchema, 401: apiErrorSchema, 404: apiErrorSchema };

  r.post(
    '/api/boards/:id/tasks',
    { schema: { params: idParamSchema, body: createTaskSchema, response: { 201: taskSchema, ...err } } },
    async (req, reply) => {
      const task = svc.createTask(db, req.params.id, req.user.id, req.body);
      hub.emit({ type: 'board', boardId: task.boardId, by: req.user.id });
      return reply.code(201).send(task);
    },
  );

  r.get(
    '/api/tasks/:id',
    { schema: { params: idParamSchema, response: { 200: taskSchema, ...err } } },
    async (req) => svc.getTask(db, req.params.id),
  );

  r.patch(
    '/api/tasks/:id',
    { schema: { params: idParamSchema, body: updateTaskSchema, response: { 200: taskSchema, ...err } } },
    async (req) => {
      const before = svc.getTask(db, req.params.id);
      const task = svc.updateTask(db, req.params.id, req.body);
      hub.emit({ type: 'board', boardId: task.boardId, by: req.user.id });
      // назначили другого человека (не себя) — ему уведомление
      if (task.assigneeId && task.assigneeId !== before.assigneeId && task.assigneeId !== req.user.id) {
        hub.emit({
          type: 'notify',
          kind: 'assigned',
          by: req.user.id,
          recipients: [task.assigneeId],
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
    const boardId = svc.deleteTask(db, req.params.id);
    hub.emit({ type: 'board', boardId, by: req.user.id });
    return reply.code(204).send();
  });

  r.post(
    '/api/tasks/:id/move',
    { schema: { params: idParamSchema, body: moveTaskSchema, response: { 200: taskSchema, ...err } } },
    async (req) => {
      const task = svc.moveTask(db, req.params.id, req.body);
      hub.emit({ type: 'board', boardId: task.boardId, by: req.user.id });
      return task;
    },
  );
}
