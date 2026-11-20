import { create } from 'zustand';

export type UploadStatus = 'preparing' | 'uploading' | 'done' | 'error';

export interface UploadItem {
  id: string;
  taskId: number;
  /** подпись для списка: «#12 Название», если известна */
  taskLabel?: string;
  name: string;
  /** исходный файл — для мгновенной миниатюры, пока он грузится */
  file?: File;
  /** 0–100 */
  progress: number;
  status: UploadStatus;
  error?: string;
}

interface UploadsState {
  items: UploadItem[];
  add: (item: UploadItem) => void;
  patch: (id: string, p: Partial<UploadItem>) => void;
  remove: (id: string) => void;
}

/** UI-состояние загрузок файлов (сами файлы — на сервере, список — TanStack Query) */
export const useUploads = create<UploadsState>()((set) => ({
  items: [],
  add: (item) => set((s) => ({ items: [...s.items, item] })),
  patch: (id, p) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));
