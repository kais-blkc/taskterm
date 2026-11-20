import imageCompression from 'browser-image-compression';
import { MAX_ATTACHMENT_BYTES } from '@taskterm/shared';

/** Эти типы сжимаем. GIF (анимация), SVG (вектор) и всё остальное отправляем как есть */
const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp']);
/** Мелкие файлы не трогаем: выигрыш копеечный, а качество теряется */
const SKIP_BELOW_BYTES = 300 * 1024;
const MAX_SIDE = 2560;

/**
 * Фото сжимаем в браузере до отправки: сторона ≤ 2560 px, WebP, качество ~0.8.
 * Если не вышло (HEIC, ошибка декодера) или результат не меньше оригинала — шлём оригинал.
 */
export async function prepareForUpload(file: File): Promise<File> {
  if (!COMPRESSIBLE.has(file.type) || file.size < SKIP_BELOW_BYTES) return file;
  try {
    const out = await imageCompression(file, {
      maxSizeMB: 4,
      maxWidthOrHeight: MAX_SIDE,
      initialQuality: 0.8,
      useWebWorker: true,
      fileType: 'image/webp',
      preserveExif: false,
    });
    if (out.size >= file.size) return file;
    return new File([out], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
}

export const tooBig = (file: File) => file.size > MAX_ATTACHMENT_BYTES;
