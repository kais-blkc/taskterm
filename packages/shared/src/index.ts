import { z } from 'zod';

export * from './admin';
export * from './attachments';
export * from './auth';
export * from './boards';
export * from './chat';
export * from './checklist';
export * from './subtasks';
export * from './colors';
export * from './comments';
export * from './events';
export * from './invites';
export * from './permissions';
export * from './telegram';
export * from './time';
export * from './policy';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
