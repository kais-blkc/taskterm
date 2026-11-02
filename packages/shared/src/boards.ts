import { z } from 'zod';
import { boardRoleSchema } from './permissions';
import { taskPolicySchema } from './policy';
import { subtaskStatSchema } from './subtasks';

const name = z.string().trim().min(1).max(100);

/** Дата дедлайна без времени: YYYY-MM-DD, существующий день календаря */
export const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'формат YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'несуществующая дата');

export const boardSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  createdAt: z.string(),
  /** роль текущего пользователя на доске (админ приложения видит себя как owner) */
  myRole: boardRoleSchema,
});
export type Board = z.infer<typeof boardSchema>;

export const columnSchema = z.object({
  id: z.number().int(),
  boardId: z.number().int(),
  name: z.string(),
  position: z.string(),
});
export type Column = z.infer<typeof columnSchema>;

export const taskSchema = z.object({
  id: z.number().int(),
  boardId: z.number().int(),
  columnId: z.number().int(),
  number: z.number().int(),
  title: z.string(),
  description: z.string(),
  position: z.string(),
  /** owner задачи: создатель, пока владение не передали */
  authorId: z.number().int(),
  assigneeId: z.number().int().nullable(),
  dueDate: z.string().nullable(),
  policy: taskPolicySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;

export const boardFullSchema = z.object({
  board: boardSchema,
  columns: z.array(columnSchema),
  tasks: z.array(taskSchema),
  subtaskStats: z.array(subtaskStatSchema),
});
export type BoardFull = z.infer<typeof boardFullSchema>;

export const createBoardSchema = z.object({ name });
export const updateBoardSchema = z.object({ name });
export const createColumnSchema = z.object({ name });
export const updateColumnSchema = z.object({ name });
export const createTaskSchema = z.object({
  columnId: z.number().int(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20000).optional(),
  dueDate: dueDateSchema.optional(),
});
export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(20000).optional(),
  // null — снять исполнителя, undefined — не менять
  assigneeId: z.number().int().nullable().optional(),
  // null — снять дедлайн, undefined — не менять
  dueDate: dueDateSchema.nullable().optional(),
});
// beforeId = id задачи, перед которой вставить; null = в конец колонки
export const moveTaskSchema = z.object({
  columnId: z.number().int(),
  beforeId: z.number().int().nullable(),
});
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export const idParamSchema = z.object({ id: z.coerce.number().int() });
export const defaultColumnNames = ['Новые', 'В работе', 'На проверке', 'Сделано'];
