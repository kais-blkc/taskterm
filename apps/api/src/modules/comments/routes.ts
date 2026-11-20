import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { commentBodySchema, commentSchema, idParamSchema } from '@taskterm/shared';
import type { Db } from '../../db/client';
import { errors } from '../../http';
import type { EventHub } from '../../plugins/hub';
import { requireUser } from '../auth/guard';
import { createCommentService } from './service';

/** Роуты тонкие: схема → сценарий из service → события в шину → ответ */
export async function commentRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));
  const svc = createCommentService(db);

  const err = errors(401, 403, 404);

  r.get(
    '/api/tasks/:id/comments',
    { schema: { params: idParamSchema, response: { 200: z.array(commentSchema), ...err } } },
    async (req) => svc.listComments(req.user, req.params.id),
  );

  r.post(
    '/api/tasks/:id/comments',
    { schema: { params: idParamSchema, body: commentBodySchema, response: { 201: commentSchema, ...err } } },
    async (req, reply) => {
      const { comment, events } = await svc.createComment(req.user, req.params.id, req.body.body);
      hub.emitAll(events);
      return reply.code(201).send(comment);
    },
  );

  r.patch(
    '/api/comments/:id',
    { schema: { params: idParamSchema, body: commentBodySchema, response: { 200: commentSchema, ...err } } },
    async (req) => {
      const { comment, events } = await svc.updateComment(req.user, req.params.id, req.body.body);
      hub.emitAll(events);
      return comment;
    },
  );

  r.delete('/api/comments/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    hub.emitAll((await svc.deleteComment(req.user, req.params.id)).events);
    return reply.code(204).send();
  });
}
