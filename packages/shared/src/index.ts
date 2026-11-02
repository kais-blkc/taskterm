import { z } from 'zod';

export * from './auth';
export * from './boards';
export * from './checklist';
export * from './subtasks';
export * from './colors';
export * from './comments';
export * from './events';
export * from './permissions';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
