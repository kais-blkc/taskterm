import { z } from 'zod';
import { userSchema } from './auth';

/** Роль участника на доске (как роли проекта в Taiga) */
export const boardRoleSchema = z.enum(['owner', 'editor', 'commenter', 'viewer']);
export type BoardRole = z.infer<typeof boardRoleSchema>;
export const BOARD_ROLES = boardRoleSchema.options;

export const ROLE_LABELS: Record<BoardRole, string> = {
  owner: 'владелец',
  editor: 'редактор',
  commenter: 'комментатор',
  viewer: 'наблюдатель',
};

export type BoardAction =
  | 'view' // видеть доску, задачи, комментарии
  | 'comment' // писать комментарии (и править/удалять свои)
  | 'createTask'
  | 'editTask' // править/переносить любые задачи, управлять их подзадачами
  | 'deleteOwnTask'
  | 'deleteAnyTask'
  | 'deleteAnyComment'
  | 'manageBoard'; // переименовать/удалить доску, колонки, участники

const VIEWER: BoardAction[] = ['view'];
const COMMENTER: BoardAction[] = [...VIEWER, 'comment'];
const EDITOR: BoardAction[] = [...COMMENTER, 'createTask', 'editTask', 'deleteOwnTask'];
const OWNER: BoardAction[] = [...EDITOR, 'deleteAnyTask', 'deleteAnyComment', 'manageBoard'];

/** Единая матрица прав: сервер проверяет по ней, клиент — только для подсветки/блокировки кнопок */
export const ROLE_ACTIONS: Record<BoardRole, readonly BoardAction[]> = {
  viewer: VIEWER,
  commenter: COMMENTER,
  editor: EDITOR,
  owner: OWNER,
};

export function roleCan(role: BoardRole | null | undefined, action: BoardAction): boolean {
  return !!role && ROLE_ACTIONS[role].includes(action);
}

/** Удаление задачи: владелец — любую, редактор — только свою */
export function canDeleteTask(role: BoardRole | null | undefined, isAuthor: boolean): boolean {
  return roleCan(role, 'deleteAnyTask') || (isAuthor && roleCan(role, 'deleteOwnTask'));
}

export const boardMemberSchema = userSchema.extend({ role: boardRoleSchema });
export type BoardMember = z.infer<typeof boardMemberSchema>;
export const setMemberRoleSchema = z.object({ role: boardRoleSchema });
