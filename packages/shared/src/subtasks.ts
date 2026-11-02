import { z } from 'zod';

export const subtaskSchema = z.object({
  id: z.number().int(),
  taskId: z.number().int(),
  title: z.string(),
  done: z.boolean(),
  createdAt: z.string(),
});
export type Subtask = z.infer<typeof subtaskSchema>;

export const createSubtaskSchema = z.object({ title: z.string().trim().min(1).max(200) });
export const updateSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  done: z.boolean().optional(),
});

/** Счётчики для карточек на доске: у задач без подзадач записи нет */
export const subtaskStatSchema = z.object({
  taskId: z.number().int(),
  total: z.number().int(),
  done: z.number().int(),
});
export type SubtaskStat = z.infer<typeof subtaskStatSchema>;
