import { z } from 'zod';
import { chatMessageSchema } from './chat';

// by — id пользователя, вызвавшего изменение (клиент пропускает свои события)
export const serverEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('users'), by: z.number().int() }),
  z.object({ type: z.literal('subtasks'), boardId: z.number().int(), taskId: z.number().int(), by: z.number().int() }),
  z.object({ type: z.literal('boards'), by: z.number().int() }),
  z.object({ type: z.literal('board'), boardId: z.number().int(), by: z.number().int() }),
  z.object({ type: z.literal('attachments'), boardId: z.number().int(), taskId: z.number().int(), by: z.number().int() }),
  z.object({ type: z.literal('comments'), boardId: z.number().int(), taskId: z.number().int(), by: z.number().int() }),
  // таймер работы: старт/пауза/стоп/правка записей (админ обновляет «кто в работе»)
  z.object({ type: z.literal('time'), by: z.number().int() }),
  // общий чат: новое сообщение / удалено (идут в WebSocket чата, SSE их не пересылает)
  z.object({ type: z.literal('chat_message'), message: chatMessageSchema, by: z.number().int() }),
  z.object({ type: z.literal('chat_deleted'), id: z.number().int(), by: z.number().int() }),
  // состав/порядок/названия тем чата изменились — клиенты перезапрашивают список
  z.object({ type: z.literal('chat_rooms'), by: z.number().int() }),
  // изменился состав/роли участников доски
  z.object({ type: z.literal('members'), boardId: z.number().int(), by: z.number().int() }),
  z.object({
    type: z.literal('notify'),
    kind: z.enum(['comment', 'assigned', 'unassigned', 'moved', 'subtask_done', 'subtask_assigned', 'subtask_unassigned']),
    by: z.number().int(),
    recipients: z.array(z.number().int()),
    boardId: z.number().int(),
    taskId: z.number().int(),
    taskNumber: z.number().int(),
    taskTitle: z.string(),
    authorName: z.string(),
    // comment — текст комментария; subtask_* — название пункта
    snippet: z.string(),
    // для kind='moved': в какую колонку перенесли
    columnName: z.string().optional(),
  }),
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;
