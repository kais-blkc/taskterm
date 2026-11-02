import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, 'only latin letters, digits, _ . -');

export const passwordSchema = z.string().min(6).max(128);

export const credentialsSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  accessPassword: z.string().min(1),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const userSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  color: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const apiErrorSchema = z.object({ error: z.string() });
export type ApiError = z.infer<typeof apiErrorSchema>;
