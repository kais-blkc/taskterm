import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminBoardSchema,
  adminUserSchema,
  auditEntrySchema,
  resetCreatedSchema,
  type AdminUser,
  type GlobalRole,
  type ResetCreated,
} from '@taskterm/shared';
import { z } from 'zod';
import { API_ENDPOINTS } from '../consts/endpoints';
import { api } from './client';

export const adminUsersKey = ['admin', 'users'] as const;
const AUDIT_PAGE = 50;

export function useAdminUsers() {
  return useQuery({
    queryKey: adminUsersKey,
    queryFn: async () => z.array(adminUserSchema).parse(await api(API_ENDPOINTS.ADMIN_USERS)),
  });
}

export function useAdminUserMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin'] });
    void qc.invalidateQueries({ queryKey: ['users'] });
  };
  return {
    update: useMutation({
      mutationFn: (v: { id: number; role?: GlobalRole; isActive?: boolean }) =>
        api<AdminUser>(API_ENDPOINTS.ADMIN_USER_ITEM(v.id), { method: 'PATCH', body: { role: v.role, isActive: v.isActive } }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (v: { id: number; transferTo: number }) =>
        api<void>(API_ENDPOINTS.ADMIN_USER_ITEM(v.id), { method: 'DELETE', body: { transferTo: v.transferTo } }),
      onSuccess: () => {
        refresh();
        void qc.invalidateQueries({ queryKey: ['boards'] });
      },
    }),
    reset: useMutation({
      mutationFn: async (id: number) =>
        resetCreatedSchema.parse(await api<ResetCreated>(API_ENDPOINTS.ADMIN_USER_RESET(id), { method: 'POST' })),
    }),
  };
}

export function useAdminBoards() {
  return useQuery({
    queryKey: ['admin', 'boards'],
    queryFn: async () => z.array(adminBoardSchema).parse(await api(API_ENDPOINTS.ADMIN_BOARDS)),
  });
}

export function useAudit() {
  return useInfiniteQuery({
    queryKey: ['admin', 'audit'],
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) =>
      z.array(auditEntrySchema).parse(
        await api(`${API_ENDPOINTS.ADMIN_AUDIT}?limit=${AUDIT_PAGE}${pageParam ? `&before=${pageParam}` : ''}`),
      ),
    getNextPageParam: (last) => (last.length === AUDIT_PAGE ? last.at(-1)!.id : undefined),
  });
}

export const resetLink = (token: string) => `${window.location.origin}/reset?token=${encodeURIComponent(token)}`;
