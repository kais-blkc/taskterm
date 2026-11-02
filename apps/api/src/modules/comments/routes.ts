import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { apiErrorSchema, commentBodySchema, commentSchema, idParamSchema } from '@taskterm/shared';
import type { Db } from '../../db/client';
import type { EventHub } from '../../plugins/hub';
import { requireUser } from '../auth/guard';
import * as svc from './service';

export async function commentRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));

  const err = { 401: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema };

  r.get(
    '/api/tasks/:id/comments',
    { schema: { params: idParamSchema, response: { 200: z.array(commentSchema), ...err } } },
    async (req) => svc.listComments(db, req.params.id),
  );

  r.post(
    '/api/tasks/:id/comments',
    { schema: { params: idParamSchema, body: commentBodySchema, response: { 201: commentSchema, ...err } } },
    async (req, reply) => {
      const { comment, task, recipients } = svc.createComment(db, req.params.id, req.user.id, req.body.body);
      hub.emit({ type: 'comments', taskId: task.id, by: req.user.id });
      hub.emit({
        type: 'notify',
        kind: 'comment',
        by: req.user.id,
        recipients,
        boardId: task.boardId,
        taskId: task.id,
        taskNumber: task.number,
        taskTitle: task.title,
        authorName: comment.authorName,
        snippet: comment.body.slice(0, 140),
      });
      return reply.code(201).send(comment);
    },
  );

  r.patch(
    '/api/comments/:id',
    { schema: { params: idParamSchema, body: commentBodySchema, response: { 200: commentSchema, ...err } } },
    async (req) => {
      const comment = svc.updateComment(db, req.params.id, req.user.id, req.body.body);
      hub.emit({ type: 'comments', taskId: comment.taskId, by: req.user.id });
      return comment;
    },
  );

  r.delete('/api/comments/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    const taskId = svc.deleteComment(db, req.params.id, req.user.id);
    hub.emit({ type: 'comments', taskId, by: req.user.id });
    return reply.code(204).send();
  });
}
