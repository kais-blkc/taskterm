import { z } from 'zod';
import { assignableRoleSchema, globalRoleSchema, passwordSchema } from './auth';

export const adminUserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  email: z.string().nullable(),
  color: z.string(),
  role: globalRoleSchema,
  isActive: z.boolean(),
  /** ставка в час; null — вам она не видна */
  hourlyRate: z.number().nullable(),
  boardsCount: z.number().int(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const updateAdminUserSchema = z
  .object({ role: assignableRoleSchema, isActive: z.boolean() })
  .partial()
  .refine((v) => v.role !== undefined || v.isActive !== undefined, 'nothing to change');

/** Ставка сотрудника (за час) */
export const setRateSchema = z.object({ hourlyRate: z.number().min(0).max(1_000_000) });

/** Удаление пользователя: его доски, задачи и комментарии переходят к transferTo */
export const deleteAdminUserSchema = z.object({ transferTo: z.number().int() });

export const RESET_TTL_HOURS = 24;
export const resetCreatedSchema = z.object({ token: z.string(), expiresAt: z.string() });
export type ResetCreated = z.infer<typeof resetCreatedSchema>;
export const resetCheckSchema = z.object({ username: z.string() });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });

export const adminBoardSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  createdAt: z.string(),
  membersCount: z.number().int(),
  tasksCount: z.number().int(),
  owners: z.array(z.string()),
  managedByAdmin: z.boolean(),
});

export const updateAdminBoardSchema = z.object({ managedByAdmin: z.boolean() });
export type AdminBoard = z.infer<typeof adminBoardSchema>;

export const auditEntrySchema = z.object({
  id: z.number().int(),
  actorName: z.string(),
  action: z.string(),
  target: z.string(),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  // курсор: записи с id меньше этого
  before: z.coerce.number().int().optional(),
});

/** Настройки уведомлений приложения (меняет админ). subtaskDone — слать админам, когда отмечают подзадачу выполненной. */
export const notifySettingsSchema = z.object({ subtaskDone: z.boolean() });
export type NotifySettings = z.infer<typeof notifySettingsSchema>;
