import { z } from 'zod';
import { globalRoleSchema } from './auth';
import { boardRoleSchema } from './permissions';

export const INVITE_TTL_DAYS = 7;

/** Доступ к доске, который выдаётся при регистрации по приглашению */
export const boardGrantSchema = z.object({ boardId: z.number().int(), role: boardRoleSchema });
export type BoardGrant = z.infer<typeof boardGrantSchema>;

export const createInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  role: globalRoleSchema.default('member'),
  boards: z.array(boardGrantSchema).max(100).default([]),
});
export type CreateInviteInput = z.input<typeof createInviteSchema>;

export const inviteStatusSchema = z.enum(['pending', 'accepted', 'expired', 'revoked']);
export type InviteStatus = z.infer<typeof inviteStatusSchema>;

export const inviteSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  role: globalRoleSchema,
  boards: z.array(boardGrantSchema),
  status: inviteStatusSchema,
  invitedBy: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  usedAt: z.string().nullable(),
});
export type Invite = z.infer<typeof inviteSchema>;

/** Ответ на создание/«новую ссылку»: токен показывается ровно один раз (в БД только хэш) */
export const inviteCreatedSchema = inviteSchema.extend({ token: z.string() });
export type InviteCreated = z.infer<typeof inviteCreatedSchema>;

/** Проверка ссылки перед показом формы регистрации */
export const inviteCheckSchema = z.object({ email: z.string(), invitedBy: z.string() });
export type InviteCheck = z.infer<typeof inviteCheckSchema>;
