import { z } from 'zod';

// by — id пользователя, вызвавшего изменение (клиент пропускает свои события)
export const serverEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('users'), by: z.number().int() }),
  z.object({ type: z.literal('subtasks'), boardId: z.number().int(), taskId: z.number().int(), by: z.number().int() }),
  z.object({ type: z.literal('boards'), by: z.number().int() }),
  z.object({ type: z.literal('board'), boardId: z.number().int(), by: z.number().int() }),
  z.object({ type: z.literal('comments'), boardId: z.number().int(), taskId: z.number().int(), by: z.number().int() }),
  // изменился состав/роли участников доски
  z.object({ type: z.literal('members'), boardId: z.number().int(), by: z.number().int() }),
  z.object({
    type: z.literal('notify'),
    kind: z.enum(['comment', 'assigned']),
    by: z.number().int(),
    recipients: z.array(z.number().int()),
    boardId: z.number().int(),
    taskId: z.number().int(),
    taskNumber: z.number().int(),
    taskTitle: z.string(),
    authorName: z.string(),
    snippet: z.string(),
  }),
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;
