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
  subtasks: 'free',
};

export const transferOwnerSchema = z.object({ userId: z.number().int() });

/** Кто действует: роль на доске и является ли owner задачи */
export type TaskActor = { role: BoardRole | null | undefined; isOwner: boolean };

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
  return roleCan(a.role, 'editTask') && (isPolicyExempt(a) || !policy[FIELD_LOCK[field]]);
}

export function canAddSubtask(policy: TaskPolicy, a: TaskActor): boolean {
  return roleCan(a.role, 'editTask') && (isPolicyExempt(a) || policy.subtasks !== 'check_only');
}

/** Отметка «сделано» доступна всем, кто может редактировать задачи */
export function canCheckSubtask(a: TaskActor): boolean {
  return roleCan(a.role, 'editTask');
}

/** Переименовать пункт: free — любой, check_and_add — только свои, check_only — никто (кроме обходящих) */
export function canChangeSubtask(policy: TaskPolicy, a: TaskActor, createdBy: number | null, userId: number): boolean {
  if (!roleCan(a.role, 'editTask')) return false;
  if (isPolicyExempt(a) || policy.subtasks === 'free') return true;
  return policy.subtasks === 'check_and_add' && createdBy !== null && createdBy === userId;
}

/** Удалить пункт: только в режиме free (и обходящим); в check_only и check_and_add удалять нельзя никому */
export function canDeleteSubtask(policy: TaskPolicy, a: TaskActor): boolean {
  return roleCan(a.role, 'editTask') && (isPolicyExempt(a) || policy.subtasks === 'free');
}

export function canCommentOn(policy: TaskPolicy, a: TaskActor): boolean {
  return roleCan(a.role, 'comment') && (isPolicyExempt(a) || !policy.commentsLocked);
}

export function isPolicyDefault(p: TaskPolicy): boolean {
  return (Object.keys(DEFAULT_TASK_POLICY) as (keyof TaskPolicy)[]).every((k) => p[k] === DEFAULT_TASK_POLICY[k]);
}
