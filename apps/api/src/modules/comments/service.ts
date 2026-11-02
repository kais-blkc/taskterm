import { asc, eq } from 'drizzle-orm';
import { first, type Db } from '../../db/client';
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

async function getComment(db: Db, id: number) {
  const row = first(
    await db.select(select).from(comments).innerJoin(users, eq(users.id, comments.authorId)).where(eq(comments.id, id)),
  );
  if (!row) throw new NotFoundError('comment not found');
  return row;
}

export async function listComments(db: Db, taskId: number) {
  await getTask(db, taskId);
  return db
    .select(select)
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.taskId, taskId))
    .orderBy(asc(comments.id));
}

export async function createComment(db: Db, taskId: number, authorId: number, body: string) {
  const task = await getTask(db, taskId);
  const [row] = await db.insert(comments).values({ taskId, authorId, body }).returning({ id: comments.id });
  const comment = await getComment(db, row!.id);

  // участники обсуждения: автор задачи, исполнитель и все, кто уже комментировал
  const participants = new Set<number>([task.authorId]);
  if (task.assigneeId) participants.add(task.assigneeId);
  for (const c of await db.select({ a: comments.authorId }).from(comments).where(eq(comments.taskId, taskId))) {
    participants.add(c.a);
  }
  participants.delete(authorId);

  return { comment, task, recipients: [...participants] };
}

export async function updateComment(db: Db, id: number, userId: number, body: string) {
  if ((await getComment(db, id)).authorId !== userId) throw new ForbiddenError('not your comment');
  await db.update(comments).set({ body, editedAt: new Date().toISOString() }).where(eq(comments.id, id));
  return getComment(db, id);
}

export async function deleteComment(db: Db, id: number, userId: number) {
  const c = await getComment(db, id);
  if (c.authorId !== userId) throw new ForbiddenError('not your comment');
  await db.delete(comments).where(eq(comments.id, id));
  return c.taskId;
}
