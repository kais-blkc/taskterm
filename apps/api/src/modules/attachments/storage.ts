import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, rmdir, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { fileTypeFromFile } from 'file-type';

/** Абсолютный путь файла по ключу; ключ не может выйти за пределы папки хранилища */
export function filePath(dir: string, key: string): string {
  const root = resolve(dir);
  const p = resolve(root, key);
  if (!p.startsWith(root + sep)) throw new Error('bad storage key');
  return p;
}

/** Сохраняет поток на диск под новым случайным ключом `<taskId>/<uuid>` (имя клиента на диск не попадает) */
export async function saveStream(dir: string, taskId: number, stream: Readable): Promise<{ key: string; size: number }> {
  const key = `${taskId}/${randomUUID()}`;
  const path = filePath(dir, key);
  await mkdir(dirname(path), { recursive: true });
  try {
    await pipeline(stream, createWriteStream(path));
  } catch (e) {
    await rm(path, { force: true });
    throw e;
  }
  return { key, size: (await stat(path)).size };
}

/** Удаляет файлы (ошибки глушим: файла уже может не быть); пустые папки задач убираем */
export async function removeFiles(dir: string, keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      const p = filePath(dir, key);
      await rm(p, { force: true });
      await rmdir(dirname(p)).catch(() => {}); // не пустая — оставляем
    } catch {
      /* ключ из БД, файл не критичен */
    }
  }
}

/** Тип по содержимому файла (первые байты), а не по заголовку клиента. Не распознали — octet-stream */
export async function sniffMime(dir: string, key: string): Promise<string> {
  const found = await fileTypeFromFile(filePath(dir, key)).catch(() => undefined);
  return found?.mime ?? 'application/octet-stream';
}

/** Читаемый кусок файла для ответа (Range: bytes=a-b) */
export function openRange(dir: string, key: string, start: number, end: number) {
  return createReadStream(filePath(dir, key), { start, end });
}

/** `bytes=a-b` | `bytes=a-` | `bytes=-n` → границы [start, end] включительно или null, если запрос некорректен */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | 'none' {
  if (!header) return 'none';
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    const n = Number(m[2]); // последние n байт
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return null;
  return { start, end };
}
