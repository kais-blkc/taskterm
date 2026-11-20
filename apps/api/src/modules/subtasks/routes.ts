import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  bulkSubtasksSchema,
  createSubtaskSchema,
  idParamSchema,
  subtaskSchema,
  updateSubtaskSchema,
} from '@taskterm/shared';
import type { Db } from '../../db/client';
import { errors } from '../../http';
import type { EventHub } from '../../plugins/hub';
import { requireUser } from '../auth/guard';
import { createSubtaskService } from './service';

/** Роуты тонкие: схема → сценарий из service → события в шину → ответ */
export async function subtaskRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));
  const svc = createSubtaskService(db);

  const err = errors(401, 403, 404);

  r.get(
    '/api/tasks/:id/subtasks',
    { schema: { params: idParamSchema, response: { 200: z.array(subtaskSchema), ...err } } },
    async (req) => svc.listSubtasks(req.user, req.params.id),
  );

  r.post(
    '/api/tasks/:id/subtasks',
    { schema: { params: idParamSchema, body: createSubtaskSchema, response: { 201: subtaskSchema, ...err } } },
    async (req, reply) => {
      const { subtask, events } = await svc.createSubtask(req.user, req.params.id, req.body.title);
      hub.emitAll(events);
      return reply.code(201).send(subtask);
    },
  );

  r.post(
    '/api/tasks/:id/subtasks/bulk',
    { schema: { params: idParamSchema, body: bulkSubtasksSchema, response: { 201: z.array(subtaskSchema), ...err } } },
    async (req, reply) => {
      const { subtasks, events } = await svc.createSubtasks(req.user, req.params.id, req.body.items);
      hub.emitAll(events);
      return reply.code(201).send(subtasks);
    },
  );

  r.patch(
    '/api/subtasks/:id',
    { schema: { params: idParamSchema, body: updateSubtaskSchema, response: { 200: subtaskSchema, ...err } } },
    async (req) => {
      const { subtask, events } = await svc.updateSubtask(req.user, req.params.id, req.body);
      hub.emitAll(events);
      return subtask;
    },
  );

  r.delete('/api/subtasks/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    hub.emitAll((await svc.deleteSubtask(req.user, req.params.id)).events);
    return reply.code(204).send();
  });
}
