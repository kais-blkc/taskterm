import { z } from 'zod';

export const subtaskSchema = z.object({
  id: z.number().int(),
  taskId: z.number().int(),
  title: z.string(),
  done: z.boolean(),
  /** кто добавил пункт (null — неизвестно/пользователь удалён) */
  createdBy: z.number().int().nullable(),
  /** исполнитель пункта (null — не назначен) */
  assigneeId: z.number().int().nullable(),
  createdAt: z.string(),
});
export type Subtask = z.infer<typeof subtaskSchema>;

export const createSubtaskSchema = z.object({ title: z.string().trim().min(1) });
export const updateSubtaskSchema = z.object({
  title: z.string().trim().min(1).optional(),
  done: z.boolean().optional(),
  /** назначить исполнителя (участник доски; станет ответственным задачи) или null — снять */
  assigneeId: z.number().int().nullable().optional(),
});

/** Счётчики для карточек на доске: у задач без подзадач записи нет */
export const subtaskStatSchema = z.object({
  taskId: z.number().int(),
  total: z.number().int(),
  done: z.number().int(),
  /** кому сколько пунктов назначено (только назначенные): для сводки на карточке */
  assignees: z.array(z.object({ userId: z.number().int(), total: z.number().int(), done: z.number().int() })),
});
export type SubtaskStat = z.infer<typeof subtaskStatSchema>;
