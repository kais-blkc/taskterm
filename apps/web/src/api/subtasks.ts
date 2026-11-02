import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { subtaskSchema, type ChecklistItem, type Subtask } from '@taskterm/shared';
import { z } from 'zod';
import { API_ENDPOINTS } from '../consts/endpoints';
import { boardKey } from './boards';
import { api } from './client';

export const subtasksKey = (taskId: number) => ['subtasks', taskId] as const;

export function useSubtasks(taskId: number) {
  return useQuery({
    queryKey: subtasksKey(taskId),
    queryFn: async () => z.array(subtaskSchema).parse(await api(API_ENDPOINTS.TASK_SUBTASKS(taskId))),
  });
}

export function useSubtaskMutations(taskId: number, boardId: number) {
  const qc = useQueryClient();
  const key = subtasksKey(taskId);
  // после любого изменения обновляем и список, и счётчики на карточках доски
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: boardKey(boardId) });
  };

  /** галочка и удаление применяются сразу, при ошибке откатываются */
  const optimistic = (apply: (list: Subtask[]) => Subtask[]) => async () => {
    await qc.cancelQueries({ queryKey: key });
    const prev = qc.getQueryData<Subtask[]>(key);
    if (prev) qc.setQueryData<Subtask[]>(key, apply(prev));
    return { prev };
  };
  const rollback = (_e: unknown, _v: unknown, ctx?: { prev?: Subtask[] }) => {
    if (ctx?.prev) qc.setQueryData(key, ctx.prev);
  };

  /** одна или много подзадач сразу (из текста-списка) */
  const addMany = useMutation({
    mutationFn: (items: ChecklistItem[]) =>
      api<Subtask[]>(API_ENDPOINTS.TASK_SUBTASKS_BULK(taskId), { method: 'POST', body: { items } }),
    onSettled: refresh,
  });

  const update = useMutation({
    mutationFn: (v: { id: number; title?: string; done?: boolean }) =>
      api<Subtask>(API_ENDPOINTS.SUBTASK_ITEM(v.id), { method: 'PATCH', body: { title: v.title, done: v.done } }),
    onMutate: (v) =>
      optimistic((list) => list.map((s) => (s.id === v.id ? { ...s, ...(v.title !== undefined && { title: v.title }), ...(v.done !== undefined && { done: v.done }) } : s)))(),
    onError: rollback,
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api<void>(API_ENDPOINTS.SUBTASK_ITEM(id), { method: 'DELETE' }),
    onMutate: (id) => optimistic((list) => list.filter((s) => s.id !== id))(),
    onError: rollback,
    onSettled: refresh,
  });

  return { addMany, update, remove };
}
