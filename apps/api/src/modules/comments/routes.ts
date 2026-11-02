import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { apiErrorSchema, commentBodySchema, commentSchema, idParamSchema } from '@taskterm/shared';
import type { Db } from '../../db/client';
import type { EventHub } from '../../plugins/hub';
import { canCommentOn, roleCan } from '@taskterm/shared';
import { requireUser } from '../auth/guard';
import { ForbiddenError, LOCKED_MESSAGE, actorOf, requireCommentBoard, requireTaskCan } from '../permissions/access';
import * as svc from './service';

export async function commentRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));

  const err = { 401: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema };

  r.get(
    '/api/tasks/:id/comments',
    { schema: { params: idParamSchema, response: { 200: z.array(commentSchema), ...err } } },
    async (req) => {
      await requireTaskCan(db, req.user, req.params.id, 'view');
      return svc.listComments(db, req.params.id);
    },
  );

  r.post(
    '/api/tasks/:id/comments',
    { schema: { params: idParamSchema, body: commentBodySchema, response: { 201: commentSchema, ...err } } },
    async (req, reply) => {
      const { task: target, role } = await requireTaskCan(db, req.user, req.params.id, 'comment');
      if (!canCommentOn(target.policy, actorOf(target, req.user, role))) throw new ForbiddenError(LOCKED_MESSAGE);
      const { comment, task, recipients } = await svc.createComment(db, req.params.id, req.user.id, req.body.body);
      hub.emit({ type: 'comments', boardId: task.boardId, taskId: task.id, by: req.user.id });
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
      const { boardId, role } = await requireCommentBoard(db, req.user, req.params.id);
      if (!roleCan(role, 'comment')) throw new ForbiddenError('not allowed for your role');
      const comment = await svc.updateComment(db, req.params.id, req.user.id, req.body.body);
      hub.emit({ type: 'comments', boardId, taskId: comment.taskId, by: req.user.id });
      return comment;
    },
  );

  r.delete('/api/comments/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    const { boardId, role } = await requireCommentBoard(db, req.user, req.params.id);
    const taskId = await svc.deleteComment(db, req.params.id, req.user.id, roleCan(role, 'deleteAnyComment'));
    hub.emit({ type: 'comments', boardId, taskId, by: req.user.id });
    return reply.code(204).send();
  });
}
