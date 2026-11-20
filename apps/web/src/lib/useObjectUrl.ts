import { useEffect, useState } from 'react';

/** Мгновенное превью выбранного файла (картинка/видео) до загрузки: blob-URL, освобождается при размонтировании */
export function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file || !(file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}
