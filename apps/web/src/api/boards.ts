import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  boardFullSchema,
  boardMemberSchema,
  boardSchema,
  type Board,
  type BoardRole,
  type BoardFull,
  type MoveTaskInput,
  type Task,
} from '@taskterm/shared';
import { z } from 'zod';
import { API_ENDPOINTS } from '../consts/endpoints';
import { api } from './client';

export const boardsKey = ['boards'] as const;
export const boardKey = (id: number) => ['board', id] as const;
export const membersKey = (id: number) => ['members', id] as const;

export function useBoards() {
  return useQuery({
    queryKey: boardsKey,
    queryFn: async () => z.array(boardSchema).parse(await api(API_ENDPOINTS.BOARDS)),
  });
}

export function useBoard(id: number, enabled = true) {
  return useQuery({
    enabled,
    queryKey: boardKey(id),
    queryFn: async () => boardFullSchema.parse(await api(API_ENDPOINTS.BOARD_ITEM(id))),
  });
}

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<Board>(API_ENDPOINTS.BOARDS, { method: 'POST', body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardsKey }),
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(API_ENDPOINTS.BOARD_ITEM(id), { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardsKey }),
  });
}

/** Мутации внутри доски: после любой — перезапрос доски */
export function useBoardMutations(boardId: number) {
  const qc = useQueryClient();
  const key = boardKey(boardId);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const addColumn = useMutation({
    mutationFn: (name: string) => api(API_ENDPOINTS.BOARD_COLUMNS(boardId), { method: 'POST', body: { name } }),
    onSuccess: refresh,
  });
  const renameColumn = useMutation({
    mutationFn: (v: { id: number; name: string }) =>
      api(API_ENDPOINTS.COLUMN_ITEM(v.id), { method: 'PATCH', body: { name: v.name } }),
    onSuccess: refresh,
  });
  const deleteColumn = useMutation({
    mutationFn: (id: number) => api<void>(API_ENDPOINTS.COLUMN_ITEM(id), { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const addTask = useMutation({
    mutationFn: (v: { columnId: number; title: string }) =>
      api(API_ENDPOINTS.BOARD_TASKS(boardId), { method: 'POST', body: v }),
    onSuccess: refresh,
  });
  const deleteTask = useMutation({
    mutationFn: (id: number) => api<void>(API_ENDPOINTS.TASK_ITEM(id), { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const moveTask = useMutation({
    mutationFn: (v: { id: number } & MoveTaskInput) =>
      api<Task>(API_ENDPOINTS.TASK_MOVE(v.id), {
        method: 'POST',
        body: { columnId: v.columnId, beforeId: v.beforeId },
      }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BoardFull>(key);
      if (prev) {
        const moved = prev.tasks.find((t) => t.id === v.id);
        if (moved) {
          const rest = prev.tasks.filter((t) => t.id !== v.id);
          const next = { ...moved, columnId: v.columnId };
          const at = v.beforeId === null ? -1 : rest.findIndex((t) => t.id === v.beforeId);
          if (at === -1) rest.push(next);
          else rest.splice(at, 0, next);
          qc.setQueryData<BoardFull>(key, { ...prev, tasks: rest });
        }
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: refresh,
  });

  return { addColumn, renameColumn, deleteColumn, addTask, deleteTask, moveTask };
}

export function useMembers(boardId: number, enabled = true) {
  return useQuery({
    enabled,
    queryKey: membersKey(boardId),
    queryFn: async () => z.array(boardMemberSchema).parse(await api(API_ENDPOINTS.BOARD_MEMBERS(boardId))),
  });
}

/** Участники доски: добавить/сменить роль, убрать (или выйти самому) */
export function useMemberMutations(boardId: number) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: membersKey(boardId) });
    void qc.invalidateQueries({ queryKey: boardKey(boardId) });
    void qc.invalidateQueries({ queryKey: boardsKey });
  };
  return {
    setRole: useMutation({
      mutationFn: (v: { userId: number; role: BoardRole }) =>
        api(API_ENDPOINTS.BOARD_MEMBER(boardId, v.userId), { method: 'PUT', body: { role: v.role } }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (userId: number) => api<void>(API_ENDPOINTS.BOARD_MEMBER(boardId, userId), { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}
