import { asc, eq } from 'drizzle-orm';
import { canCommentOn, roleCan, type ServerEvent } from '@taskterm/shared';
import { bindDb, first, type Db } from '../../db/client';
import { comments, users } from '../../db/schema';
import { NotFoundError } from '../boards/service';
import type { AuthUser } from '../auth/service';
import { commentNotice } from '../notify/events';
import { ForbiddenError, LOCKED_MESSAGE, actorOf, requireCommentBoard, requireTaskCan } from '../permissions/access';
import { getTask } from '../tasks/service';

export { ForbiddenError };

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
  if (!row) throw new NotFoundError('комментарий не найден');
  return row;
}

async function listCommentsRows(db: Db, taskId: number) {
  await getTask(db, taskId);
  return db
    .select(select)
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.taskId, taskId))
    .orderBy(asc(comments.id));
}

async function createCommentRow(db: Db, taskId: number, authorId: number, body: string) {
  const task = await getTask(db, taskId);
  const [row] = await db.insert(comments).values({ taskId, authorId, body }).returning({ id: comments.id });
  const comment = await getComment(db, row!.id);

  // участники обсуждения: автор задачи, исполнитель и все, кто уже комментировал
  const participants = new Set<number>([task.authorId]);
  for (const a of task.assigneeIds) participants.add(a);
  for (const c of await db.select({ a: comments.authorId }).from(comments).where(eq(comments.taskId, taskId))) {
    participants.add(c.a);
  }
  participants.delete(authorId);

  return { comment, task, recipients: [...participants] };
}

async function updateCommentRow(db: Db, id: number, userId: number, body: string) {
  if ((await getComment(db, id)).authorId !== userId) throw new ForbiddenError('это не ваш комментарий');
  await db.update(comments).set({ body, editedAt: new Date().toISOString() }).where(eq(comments.id, id));
  return getComment(db, id);
}

/** force — владелец доски может удалить чужой комментарий */
async function deleteCommentRow(db: Db, id: number, userId: number, force = false) {
  const c = await getComment(db, id);
  if (c.authorId !== userId && !force) throw new ForbiddenError('это не ваш комментарий');
  await db.delete(comments).where(eq(comments.id, id));
  return c.taskId;
}

// ─── Сценарии (use cases): права → изменение → события; шину отдаёт роут ──────

async function listComments(db: Db, user: AuthUser, taskId: number) {
  await requireTaskCan(db, user, taskId, 'view');
  return listCommentsRows(db, taskId);
}

async function createComment(db: Db, user: AuthUser, taskId: number, body: string) {
  const { task: target, role } = await requireTaskCan(db, user, taskId, 'comment');
  if (!canCommentOn(target.policy, actorOf(target, user, role))) throw new ForbiddenError(LOCKED_MESSAGE);
  const { comment, task, recipients } = await createCommentRow(db, taskId, user.id, body);
  const events: ServerEvent[] = [
    { type: 'comments', boardId: task.boardId, taskId: task.id, by: user.id },
    commentNotice(task, user, comment.body, recipients),
  ];
  return { comment, events };
}

async function updateComment(db: Db, user: AuthUser, id: number, body: string) {
  const { boardId, role } = await requireCommentBoard(db, user, id);
  if (!roleCan(role, 'comment')) throw new ForbiddenError('недостаточно прав для этого действия');
  const comment = await updateCommentRow(db, id, user.id, body);
  return { comment, events: [{ type: 'comments', boardId, taskId: comment.taskId, by: user.id } as ServerEvent] };
}

/** Своё — всегда; чужое — только с правом deleteAnyComment (владелец доски) */
async function deleteComment(db: Db, user: AuthUser, id: number) {
  const { boardId, role } = await requireCommentBoard(db, user, id);
  const taskId = await deleteCommentRow(db, id, user.id, roleCan(role, 'deleteAnyComment'));
  return { events: [{ type: 'comments', boardId, taskId, by: user.id } as ServerEvent] };
}

/** Сервис, привязанный к БД: `const svc = createCommentService(db)`; внутри транзакции — `createCommentService(tx)` */
export const createCommentService = (db: Db) =>
  bindDb(db, { listComments, createComment, updateComment, deleteComment });
