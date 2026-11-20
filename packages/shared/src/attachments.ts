import { z } from 'zod';

/** До скольких файлов можно прикрепить к одной задаче */
export const MAX_ATTACHMENTS = 10;
/** Максимальный размер одного файла, байт (50 МБ) */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export const attachmentSchema = z.object({
  id: z.number().int(),
  taskId: z.number().int(),
  /** исходное имя файла */
  name: z.string(),
  /** тип по содержимому файла (не по заголовку клиента) */
  mime: z.string(),
  size: z.number().int(),
  uploadedBy: z.number().int().nullable(),
  createdAt: z.string(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const attachmentStatSchema = z.object({ taskId: z.number().int(), count: z.number().int() });
export type AttachmentStat = z.infer<typeof attachmentStatSchema>;

export type AttachmentKind = 'image' | 'video' | 'pdf' | 'other';

/** Что браузеру можно показывать прямо на странице; остальное (и SVG: в нём может быть скрипт) — только скачивание */
export function attachmentKind(mime: string): AttachmentKind {
  if (mime === 'image/svg+xml') return 'other';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}
