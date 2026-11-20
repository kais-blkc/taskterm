import type { ServerEvent } from '@taskterm/shared';

export type NotifyEvent = Extract<ServerEvent, { type: 'notify' }>;

type TaskRef = { id: number; boardId: number; number: number; title: string };
type Actor = { id: number; username: string };

/** Общая «шапка» события notify: задача + кто сделал. Единственное место, где собираются эти поля. */
function base(kind: NotifyEvent['kind'], task: TaskRef, actor: Actor, recipients: number[]) {
  return {
    type: 'notify' as const,
    kind,
    by: actor.id,
    recipients,
    boardId: task.boardId,
    taskId: task.id,
    taskNumber: task.number,
    taskTitle: task.title,
    authorName: actor.username,
    snippet: '',
  };
}

/** Новый комментарий → прошлые участники обсуждения (получателей считает сервис комментариев) */
export function commentNotice(
  task: TaskRef,
  actor: Actor,
  body: string,
  recipients: number[],
): NotifyEvent {
  return { ...base('comment', task, actor, recipients), snippet: body.slice(0, 140) };
}

/** Назначили новых ответственных (не самого себя). null — новых нет. */
export function assignedNotice(
  before: { assigneeIds: number[] },
  task: TaskRef & { assigneeIds: number[] },
  actor: Actor,
): NotifyEvent | null {
  const added = task.assigneeIds.filter((u) => !before.assigneeIds.includes(u) && u !== actor.id);
  return added.length ? base('assigned', task, actor, added) : null;
}

/** Сняли с задачи (не самого себя). null — никого не сняли. */
export function unassignedNotice(
  before: { assigneeIds: number[] },
  task: TaskRef & { assigneeIds: number[] },
  actor: Actor,
): NotifyEvent | null {
  const removed = before.assigneeIds.filter((u) => !task.assigneeIds.includes(u) && u !== actor.id);
  return removed.length ? base('unassigned', task, actor, removed) : null;
}

/** Отметили пункт чек-листа выполненным. Получателей (админов) считает `subtaskDoneRecipients`. null — слать некому. */
export function subtaskDoneNotice(
  task: TaskRef,
  actor: Actor,
  subtaskTitle: string,
  recipients: number[],
): NotifyEvent | null {
  return recipients.length
    ? { ...base('subtask_done', task, actor, recipients), snippet: subtaskTitle.slice(0, 140) }
    : null;
}

/** Назначили исполнителем пункта чек-листа / сняли с него (получатель — тот, кого касается; сам себя не уведомляем — решает сервис) */
export function subtaskAssigneeNotice(
  kind: 'subtask_assigned' | 'subtask_unassigned',
  task: TaskRef,
  actor: Actor,
  subtaskTitle: string,
  recipient: number,
): NotifyEvent {
  return { ...base(kind, task, actor, [recipient]), snippet: subtaskTitle.slice(0, 140) };
}

/** Задачу перенесли в колонку с включёнными уведомлениями */
export function movedNotice(
  task: TaskRef,
  actor: Actor,
  columnName: string,
  recipients: number[],
): NotifyEvent {
  return { ...base('moved', task, actor, recipients), columnName };
}
