import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inviteCheckSchema,
  inviteCreatedSchema,
  inviteSchema,
  type CreateInviteInput,
  type InviteCreated,
} from '@taskterm/shared';
import { z } from 'zod';
import { API_ENDPOINTS } from '../consts/endpoints';
import { api } from './client';

export const invitesKey = ['invites'] as const;

export function useInvites() {
  return useQuery({
    queryKey: invitesKey,
    queryFn: async () => z.array(inviteSchema).parse(await api(API_ENDPOINTS.INVITES)),
  });
}

export function useInviteMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: invitesKey });
  return {
    create: useMutation({
      mutationFn: async (v: CreateInviteInput) =>
        inviteCreatedSchema.parse(await api<InviteCreated>(API_ENDPOINTS.INVITES, { method: 'POST', body: v })),
      onSuccess: refresh,
    }),
    resend: useMutation({
      mutationFn: async (id: number) =>
        inviteCreatedSchema.parse(await api<InviteCreated>(API_ENDPOINTS.INVITE_RESEND(id), { method: 'POST' })),
      onSuccess: refresh,
    }),
    revoke: useMutation({
      mutationFn: (id: number) => api<void>(API_ENDPOINTS.INVITE_ITEM(id), { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}

/** Проверка ссылки на странице регистрации (без авторизации) */
export function useInviteCheck(token: string) {
  return useQuery({
    enabled: token.length > 0,
    queryKey: ['invite-check', token],
    retry: false,
    staleTime: Infinity,
    queryFn: async () =>
      inviteCheckSchema.parse(await api(`${API_ENDPOINTS.INVITE_CHECK}?token=${encodeURIComponent(token)}`)),
  });
}

/** Ссылка для отправки приглашённому */
export const inviteLink = (token: string) => `${window.location.origin}/register?token=${encodeURIComponent(token)}`;
