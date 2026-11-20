import { z } from 'zod';
import { roleCan, type BoardRole } from './permissions';

/**
 * Политика задачи: owner задачи решает, что остальные редактора могут в ней менять.
 * Владельца доски, админа и самого owner задачи политика не ограничивает.
 */
export const subtaskModeSchema = z.enum(['free', 'check_only', 'check_and_add']);
export type SubtaskMode = z.infer<typeof subtaskModeSchema>;

export const SUBTASK_MODE_LABELS: Record<SubtaskMode, string> = {
  free: 'можно всё',
  check_only: 'только отмечать',
  check_and_add: 'отмечать и добавлять свои',
};

export const taskPolicySchema = z.object({
  lockTitle: z.boolean(),
  lockDescription: z.boolean(),
  lockAssignee: z.boolean(),
  lockDueDate: z.boolean(),
  lockMove: z.boolean(),
  commentsLocked: z.boolean(),
  subtasks: subtaskModeSchema,
});
export type TaskPolicy = z.infer<typeof taskPolicySchema>;

export const DEFAULT_TASK_POLICY: TaskPolicy = {
  lockTitle: false,
  lockDescription: false,
  lockAssignee: false,
  lockDueDate: false,
  lockMove: false,
  commentsLocked: false,
  // редактор трогает только свои пункты (созданные или назначенные ему); «free» — всё в задаче, его владелец включает сам
  subtasks: 'check_and_add',
};

export const transferOwnerSchema = z.object({ userId: z.number().int() });

/** Кто действует: роль на доске, owner ли он задачи и «свой» ли он в ней (автор или ответственный) */
export type TaskActor = { role: BoardRole | null | undefined; isOwner: boolean; involved?: boolean };

/** Действующее лицо по задаче: автор — owner задачи; автор и ответственные — «свои» в ней */
export function taskActor(task: { authorId: number; assigneeIds: number[] }, userId: number, role: BoardRole | null | undefined): TaskActor {
  const isOwner = task.authorId === userId;
  return { role, isOwner, involved: isOwner || task.assigneeIds.includes(userId) };
}

/**
 * Править задачу и работать с её подзадачами/файлами. Редактор — только в «своих» задачах (автор или ответственный),
 * в чужих он видит и комментирует; владелец доски и админ — везде.
 */
export function canEditTask(a: TaskActor): boolean {
  return roleCan(a.role, 'editTask') && (a.role === 'owner' || a.isOwner || !!a.involved);
}

export type PolicyField = 'title' | 'description' | 'assignee' | 'dueDate' | 'move';
const FIELD_LOCK: Record<PolicyField, keyof TaskPolicy> = {
  title: 'lockTitle',
  description: 'lockDescription',
  assignee: 'lockAssignee',
  dueDate: 'lockDueDate',
  move: 'lockMove',
};

/** Политику обходят: владелец доски (и админ) и owner задачи, пока у него есть право редактировать */
export function isPolicyExempt(a: TaskActor): boolean {
  return a.role === 'owner' || (a.isOwner && roleCan(a.role, 'editTask'));
}

/** Менять политику и передавать владение задачей */
export const canManageTask = isPolicyExempt;

export function canEditField(policy: TaskPolicy, a: TaskActor, field: PolicyField): boolean {
  return canEditTask(a) && (isPolicyExempt(a) || !policy[FIELD_LOCK[field]]);
}

export function canAddSubtask(policy: TaskPolicy, a: TaskActor): boolean {
  return canEditTask(a) && (isPolicyExempt(a) || policy.subtasks !== 'check_only');
}

type SubtaskOwnership = { createdBy: number | null; assigneeId: number | null };

/**
 * Менять пункт (отметить, переименовать, назначить, удалить). Владелец доски, админ и owner задачи — любой;
 * в режиме `free` — любой «свой» в задаче; иначе редактор — только пункты, которые создал или которые назначены ему.
 */
export function canChangeSubtask(policy: TaskPolicy, a: TaskActor, s: SubtaskOwnership, userId: number): boolean {
  if (!canEditTask(a)) return false;
  if (isPolicyExempt(a) || policy.subtasks === 'free') return true;
  return s.createdBy === userId || s.assigneeId === userId;
}

/** Отметка «сделано» и удаление подчиняются тому же правилу, что и переименование */
export const canCheckSubtask = canChangeSubtask;
export const canDeleteSubtask = canChangeSubtask;

export function canCommentOn(policy: TaskPolicy, a: TaskActor): boolean {
  return roleCan(a.role, 'comment') && (isPolicyExempt(a) || !policy.commentsLocked);
}

export function isPolicyDefault(p: TaskPolicy): boolean {
  return (Object.keys(DEFAULT_TASK_POLICY) as (keyof TaskPolicy)[]).every((k) => p[k] === DEFAULT_TASK_POLICY[k]);
}
