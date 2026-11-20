import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createTaskSchema,
  idParamSchema,
  moveTaskSchema,
  taskPolicySchema,
  taskSchema,
  transferOwnerSchema,
  updateTaskSchema,
} from '@taskterm/shared';
import type { Db } from '../../db/client';
import { errors } from '../../http';
import type { EventHub } from '../../plugins/hub';
import { removeFiles } from '../attachments/storage';
import { requireUser } from '../auth/guard';
import { requireTaskCan } from '../permissions/access';
import { createTaskService } from './service';

/** Роуты тонкие: схема → вызов сценария из service → события в шину → ответ */
export async function taskRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub; uploadsDir: string }) {
  const { db, hub, uploadsDir } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));
  const svc = createTaskService(db);

  const err = errors(400, 401, 403, 404);

  r.post(
    '/api/boards/:id/tasks',
    {
      schema: {
        params: idParamSchema,
        body: createTaskSchema,
        response: { 201: taskSchema, ...err },
      },
    },
    async (req, reply) => {
      const { task, events } = await svc.createTask(req.user, req.params.id, req.body);
      hub.emitAll(events);
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
    {
      schema: {
        params: idParamSchema,
        body: updateTaskSchema,
        response: { 200: taskSchema, ...err },
      },
    },
    async (req) => {
      const { task, events } = await svc.updateTask(req.user, req.params.id, req.body);
      hub.emitAll(events);
      return task;
    },
  );

  r.delete('/api/tasks/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    const { events, files } = await svc.deleteTask(req.user, req.params.id);
    await removeFiles(uploadsDir, files);
    hub.emitAll(events);
    return reply.code(204).send();
  });

  r.post(
    '/api/tasks/:id/move',
    {
      schema: {
        params: idParamSchema,
        body: moveTaskSchema,
        response: { 200: taskSchema, ...err },
      },
    },
    async (req) => {
      const { task, events } = await svc.moveTask(req.user, req.params.id, req.body);
      hub.emitAll(events);
      return task;
    },
  );

  r.put(
    '/api/tasks/:id/policy',
    {
      schema: {
        params: idParamSchema,
        body: taskPolicySchema,
        response: { 200: taskSchema, ...err },
      },
    },
    async (req) => {
      const { task, events } = await svc.setPolicy(req.user, req.params.id, req.body);
      hub.emitAll(events);
      return task;
    },
  );

  r.post(
    '/api/tasks/:id/owner',
    {
      schema: {
        params: idParamSchema,
        body: transferOwnerSchema,
        response: { 200: taskSchema, ...err },
      },
    },
    async (req) => {
      const { task, events } = await svc.transferOwner(req.user, req.params.id, req.body.userId);
      hub.emitAll(events);
      return task;
    },
  );
}
