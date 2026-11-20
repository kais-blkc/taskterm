import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attachmentSchema, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, formatBytes, type Attachment } from '@taskterm/shared';
import { z } from 'zod';
import { API_BASE, API_ENDPOINTS } from '../consts/endpoints';
import { prepareForUpload } from '../lib/images';
import { useUploads } from '../stores/uploads';
import { api, refreshSession } from './client';
import { boardKey } from './boards';

export const attachmentsKey = (taskId: number) => ['attachments', taskId] as const;
export const attachmentUrl = (id: number, download = false) => `${API_BASE}${API_ENDPOINTS.ATTACHMENT_ITEM(id)}${download ? '?download' : ''}`;

export function useAttachments(taskId: number) {
  return useQuery({
    queryKey: attachmentsKey(taskId),
    queryFn: async () => z.array(attachmentSchema).parse(await api(API_ENDPOINTS.TASK_ATTACHMENTS(taskId))),
  });
}

export function useDeleteAttachment(taskId: number, boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(API_ENDPOINTS.ATTACHMENT_ITEM(id), { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: attachmentsKey(taskId) });
      void qc.invalidateQueries({ queryKey: boardKey(boardId) });
    },
  });
}

/** Один файл через XHR (fetch не умеет прогресс отправки); 401 → один обмен refresh и повтор */
function xhrUpload(taskId: number, file: File, onProgress: (pct: number) => void): Promise<{ status: number; body: unknown }> {
  const once = () =>
    new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}${API_ENDPOINTS.TASK_ATTACHMENTS(taskId)}`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onerror = () => reject(new Error('нет связи с сервером'));
      xhr.onload = () => {
        let body: unknown = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* пустой или не JSON */
        }
        resolve({ status: xhr.status, body });
      };
      const form = new FormData();
      form.append('file', file, file.name);
      xhr.send(form);
    });
  return once().then(async (r) => (r.status === 401 && (await refreshSession()) ? once() : r));
}

/**
 * Загрузка файлов к задаче: фото сжимаются, потом файлы уходят по одному (сбой одного не рушит остальные).
 * Прогресс и ошибки — в `stores/uploads`; пока идёт загрузка, окно задачи можно закрыть.
 * `existing` — сколько файлов у задачи уже есть (лимит 10 проверяем до отправки).
 */
export function useUploadFiles() {
  const qc = useQueryClient();
  return async (taskId: number, boardId: number, files: File[], opts: { existing?: number; taskLabel?: string } = {}) => {
    const { add, patch, remove } = useUploads.getState();
    let free = MAX_ATTACHMENTS - (opts.existing ?? 0);
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: attachmentsKey(taskId) });
      void qc.invalidateQueries({ queryKey: boardKey(boardId) });
    };
    for (const original of files) {
      const id = `${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      add({ id, taskId, taskLabel: opts.taskLabel, name: original.name, file: original, progress: 0, status: 'preparing' });
      if (free <= 0) {
        patch(id, { status: 'error', error: `не больше ${MAX_ATTACHMENTS} файлов на задачу` });
        continue;
      }
      const file = await prepareForUpload(original);
      if (file.size > MAX_ATTACHMENT_BYTES) {
        patch(id, { status: 'error', error: `файл больше ${formatBytes(MAX_ATTACHMENT_BYTES)} (${formatBytes(file.size)})` });
        continue;
      }
      patch(id, { status: 'uploading' });
      try {
        const res = await xhrUpload(taskId, file, (progress) => patch(id, { progress }));
        if (res.status === 201) {
          free -= 1;
          patch(id, { status: 'done', progress: 100 });
          refresh();
          setTimeout(() => remove(id), 1500);
        } else {
          const msg = (res.body as { error?: string } | null)?.error;
          patch(id, { status: 'error', error: msg ?? `ошибка ${res.status}` });
        }
      } catch (e) {
        patch(id, { status: 'error', error: (e as Error).message });
      }
    }
  };
}

export type { Attachment };
