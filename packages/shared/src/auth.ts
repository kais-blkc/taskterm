import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, 'only latin letters, digits, _ . -');

export const passwordSchema = z.string().min(6).max(128);

/** Вход: логин и пароль */
export const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Регистрация (временно по общему ключу доступа; с этапа «инвайты» — по токену приглашения) */
export const credentialsSchema = loginSchema.extend({
  accessPassword: z.string().min(1),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const userSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  color: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const globalRoleSchema = z.enum(['admin', 'member']);
export type GlobalRole = z.infer<typeof globalRoleSchema>;

/** Текущий пользователь (ответ login/register/me): User + роль и почта */
export const meSchema = userSchema.extend({
  email: z.string().nullable(),
  role: globalRoleSchema,
});
export type Me = z.infer<typeof meSchema>;

export const apiErrorSchema = z.object({ error: z.string() });
export type ApiError = z.infer<typeof apiErrorSchema>;
