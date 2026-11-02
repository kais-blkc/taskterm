import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userSchema, type User } from '@taskterm/shared';
import { z } from 'zod';
import { API_ENDPOINTS } from '../consts/endpoints';
import { api } from './client';
import { meKey } from './auth';

export const usersKey = ['users'] as const;

export function useUsers() {
  const query = useQuery({
    queryKey: usersKey,
    queryFn: async () => z.array(userSchema).parse(await api(API_ENDPOINTS.USERS)),
    staleTime: 30_000,
  });
  const byId = new Map<number, User>((query.data ?? []).map((u) => [u.id, u]));
  return { ...query, byId };
}

export function useSetColor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (color: string) => api<User>(API_ENDPOINTS.USERS_ME_COLOR, { method: 'PATCH', body: { color } }),
    onSuccess: (user) => {
      qc.setQueryData(meKey, user);
      void qc.invalidateQueries({ queryKey: usersKey });
    },
  });
}
