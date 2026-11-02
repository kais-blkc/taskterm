import { z } from 'zod';

export const commentSchema = z.object({
  id: z.number().int(),
  taskId: z.number().int(),
  authorId: z.number().int(),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
});
export type Comment = z.infer<typeof commentSchema>;

export const commentBodySchema = z.object({ body: z.string().trim().min(1).max(10000) });
