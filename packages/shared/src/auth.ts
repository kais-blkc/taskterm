import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, 'только латинские буквы, цифры и символы _ . -');

export const passwordSchema = z.string().min(6).max(128);

/** Вход: логин и пароль */
export const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Регистрация только по токену приглашения; email берётся из приглашения */
export const registerSchema = loginSchema.extend({
  token: z.string().min(20).max(200),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const userSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  color: z.string(),
});
export type User = z.infer<typeof userSchema>;

/** owner — главный админ (один); admin — полные права; moderator — админка без времени/ставок/ролей; member — обычный */
export const globalRoleSchema = z.enum(['owner', 'admin', 'moderator', 'member']);
export type GlobalRole = z.infer<typeof globalRoleSchema>;
/** Роли, которые можно выдать (owner не выдаётся — он один) */
export const assignableRoleSchema = z.enum(['admin', 'moderator', 'member']);

/** Полные админские права: owner и admin (время, ставки, роли, журнал, настройки) */
export const isAdminRole = (role: GlobalRole): boolean => role === 'owner' || role === 'admin';
/** Доступ в админ-панель: owner, admin, moderator */
export const isStaffRole = (role: GlobalRole): boolean => role !== 'member';

type Who = { id: number; role: GlobalRole };
/**
 * Кто чью ставку и отработанное время видит: owner — всех; admin — свои и участников/модераторов
 * (ставки и часы владельца и других админов скрыты); moderator и member — только свои.
 */
export function canSeeRateOf(viewer: Who, target: Who): boolean {
  if (viewer.id === target.id) return true;
  if (viewer.role === 'owner') return true;
  if (viewer.role === 'admin') return target.role === 'member' || target.role === 'moderator';
  return false;
}
/** Менять ставку: owner — любую; admin — участников и модераторов (не свою и не админов) */
export function canSetRateOf(actor: Who, target: Who): boolean {
  if (actor.role === 'owner') return true;
  return actor.role === 'admin' && (target.role === 'member' || target.role === 'moderator');
}
/** Действия над пользователем (блок, сброс пароля): owner — не трогаем никому; admin — всех кроме owner; moderator — только участников */
export function canManageUser(actor: Who, target: Who): boolean {
  if (actor.id === target.id) return actor.role !== 'member';
  if (target.role === 'owner') return false;
  if (actor.role === 'owner' || actor.role === 'admin') return true;
  return actor.role === 'moderator' && target.role === 'member';
}

/** Текущий пользователь (ответ login/register/me): User + роль и почта */
export const meSchema = userSchema.extend({
  email: z.string().nullable(),
  role: globalRoleSchema,
});
export type Me = z.infer<typeof meSchema>;

export const apiErrorSchema = z.object({ error: z.string() });
export type ApiError = z.infer<typeof apiErrorSchema>;
