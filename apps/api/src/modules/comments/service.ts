import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { comments, users } from '../../db/schema';
import { NotFoundError } from '../boards/service';
import { getTask } from '../tasks/service';

export class ForbiddenError extends Error {
  status = 403;
}

const select = {
  id: comments.id,
  taskId: comments.taskId,
  authorId: comments.authorId,
  authorName: users.username,
  body: comments.body,
  createdAt: comments.createdAt,
  editedAt: comments.editedAt,
};

function getComment(db: Db, id: number) {
  const row = db
    .select(select)
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.id, id))
    .get();
  if (!row) throw new NotFoundError('comment not found');
  return row;
}

export function listComments(db: Db, taskId: number) {
  getTask(db, taskId);
  return db
    .select(select)
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.taskId, taskId))
    .orderBy(asc(comments.id))
    .all();
}

export function createComment(db: Db, taskId: number, authorId: number, body: string) {
  const task = getTask(db, taskId);
  const row = db.insert(comments).values({ taskId, authorId, body }).returning({ id: comments.id }).get();
  const comment = getComment(db, row.id);

  // участники обсуждения: автор задачи, исполнитель и все, кто уже комментировал
  const participants = new Set<number>([task.authorId]);
  if (task.assigneeId) participants.add(task.assigneeId);
  for (const c of db.select({ a: comments.authorId }).from(comments).where(eq(comments.taskId, taskId)).all()) {
    participants.add(c.a);
  }
  participants.delete(authorId);

  return { comment, task, recipients: [...participants] };
}

export function updateComment(db: Db, id: number, userId: number, body: string) {
  if (getComment(db, id).authorId !== userId) throw new ForbiddenError('not your comment');
  db.update(comments)
    .set({ body, editedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') })
    .where(eq(comments.id, id))
    .run();
  return getComment(db, id);
}

export function deleteComment(db: Db, id: number, userId: number) {
  const c = getComment(db, id);
  if (c.authorId !== userId) throw new ForbiddenError('not your comment');
  db.delete(comments).where(eq(comments.id, id)).run();
  return c.taskId;
}
