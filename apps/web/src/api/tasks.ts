import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commentSchema, type Comment, type Task } from '@taskterm/shared';
import { z } from 'zod';
import { API_ENDPOINTS } from '../consts/endpoints';
import { api } from './client';
import { boardKey } from './boards';

export const commentsKey = (taskId: number) => ['comments', taskId] as const;

export function useUpdateTask(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; title?: string; description?: string; assigneeId?: number | null; dueDate?: string | null }) =>
      api<Task>(API_ENDPOINTS.TASK_ITEM(v.id), {
        method: 'PATCH',
        body: { title: v.title, description: v.description, assigneeId: v.assigneeId, dueDate: v.dueDate },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(boardId) }),
  });
}

export function useComments(taskId: number) {
  return useQuery({
    queryKey: commentsKey(taskId),
    queryFn: async () => z.array(commentSchema).parse(await api(API_ENDPOINTS.TASK_COMMENTS(taskId))),
  });
}

export function useCommentMutations(taskId: number) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: commentsKey(taskId) });
  return {
    add: useMutation({
      mutationFn: (body: string) => api<Comment>(API_ENDPOINTS.TASK_COMMENTS(taskId), { method: 'POST', body: { body } }),
      onSuccess: refresh,
    }),
    edit: useMutation({
      mutationFn: (v: { id: number; body: string }) =>
        api<Comment>(API_ENDPOINTS.COMMENT_ITEM(v.id), { method: 'PATCH', body: { body: v.body } }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api<void>(API_ENDPOINTS.COMMENT_ITEM(id), { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}
