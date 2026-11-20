import { basename } from 'node:path';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { attachmentKind, attachmentSchema, idParamSchema } from '@taskterm/shared';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import { errors } from '../../http';
import type { EventHub } from '../../plugins/hub';
import { requireUser } from '../auth/guard';
import { openRange, parseRange, removeFiles, saveStream, sniffMime } from './storage';
import { AttachmentError, createAttachmentService } from './service';

/** Имя от клиента → безопасная подпись: без путей и управляющих символов, до 200 знаков */
const cleanName = (raw: string) => {
  // eslint-disable-next-line no-control-regex
  const n = basename(raw.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (n || 'file').slice(0, 200);
};

/** Файлы задач: загрузка по одному (multipart), список, отдача с Range (видео перематывается), удаление */
export async function attachmentRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub; config: Config }) {
  const { db, hub, config } = opts;
  const dir = config.uploadsDir;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1, fields: 0, parts: 2 } });
  const svc = createAttachmentService(db);
  const err = errors(400, 401, 403, 404, 409);

  r.get(
    '/api/tasks/:id/attachments',
    { schema: { params: idParamSchema, response: { 200: z.array(attachmentSchema), ...err } } },
    async (req) => svc.listAttachments(req.user, req.params.id),
  );

  r.post(
    '/api/tasks/:id/attachments',
    { schema: { params: idParamSchema, response: { 201: attachmentSchema, ...err } } },
    async (req, reply) => {
      const taskId = req.params.id;
      await svc.assertCanAdd(req.user, taskId); // права и место — до того, как принимать байты
      const part = await req.file();
      if (!part) throw new AttachmentError('файл не передан', 400);
      const saved = await saveStream(dir, taskId, part.file);
      try {
        if (part.file.truncated) {
          throw new AttachmentError(`файл больше ${Math.round(config.maxUploadBytes / 1024 / 1024)} МБ`, 413);
        }
        if (saved.size === 0) throw new AttachmentError('файл пустой', 400);
        const mime = await sniffMime(dir, saved.key);
        const { attachment, events } = await svc.addAttachment(req.user, taskId, { key: saved.key, name: cleanName(part.filename), mime, size: saved.size });
        hub.emitAll(events);
        return reply.code(201).send(attachment);
      } catch (e) {
        await removeFiles(dir, [saved.key]); // запись не создалась — файл на диске не нужен
        throw e;
      }
    },
  );

  r.get(
    '/api/attachments/:id',
    { schema: { params: idParamSchema, querystring: z.object({ download: z.string().optional() }) } },
    async (req, reply) => {
      const a = await svc.getAttachmentFile(req.user, req.params.id);
      // картинки, видео и PDF можно показывать на странице; остальное (и SVG) — только скачивание
      const kind = attachmentKind(a.mime);
      const inline = kind !== 'other' && req.query.download === undefined;
      const range = parseRange(req.headers.range, a.size);
      if (range === null) return reply.code(416).header('content-range', `bytes */${a.size}`).send();
      reply
        .header('content-type', kind === 'other' ? 'application/octet-stream' : a.mime)
        .header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.name)}`)
        .header('x-content-type-options', 'nosniff')
        .header('accept-ranges', 'bytes')
        .header('cache-control', 'private, max-age=3600');
      if (kind === 'image' || kind === 'video') reply.header('content-security-policy', "default-src 'none'; sandbox");
      if (range === 'none') return reply.header('content-length', a.size).send(openRange(dir, a.storageKey, 0, Math.max(a.size - 1, 0)));
      return reply
        .code(206)
        .header('content-range', `bytes ${range.start}-${range.end}/${a.size}`)
        .header('content-length', range.end - range.start + 1)
        .send(openRange(dir, a.storageKey, range.start, range.end));
    },
  );

  r.delete('/api/attachments/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    const { events, files } = await svc.deleteAttachment(req.user, req.params.id);
    await removeFiles(dir, files);
    hub.emitAll(events);
    return reply.code(204).send();
  });
}

