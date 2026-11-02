import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { meSchema, type Credentials, type LoginInput, type Me } from '@taskterm/shared';
import { API_ENDPOINTS } from '../consts/endpoints';
import { api, ApiError, setSessionLostHandler } from './client';

export const meKey = ['me'] as const;

export function useMe() {
  return useQuery<Me | null>({
    queryKey: meKey,
    queryFn: async () => {
      try {
        return meSchema.parse(await api(API_ENDPOINTS.AUTH_ME));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

/** Если refresh-токен перестал действовать — сбрасываем пользователя, App покажет вход */
export function useSessionGuard() {
  const qc = useQueryClient();
  useEffect(() => {
    setSessionLostHandler(() => {
      qc.setQueryData(meKey, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    });
    return () => setSessionLostHandler(null);
  }, [qc]);
}

export function useAuth(mode: 'login' | 'register') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: LoginInput | Credentials) =>
      api<Me>(mode === 'login' ? API_ENDPOINTS.AUTH_LOGIN : API_ENDPOINTS.AUTH_REGISTER, {
        method: 'POST',
        body: c,
      }),
    onSuccess: (user) => qc.setQueryData(meKey, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(API_ENDPOINTS.AUTH_LOGOUT, { method: 'POST' }),
    onSuccess: () => {
      qc.setQueryData(meKey, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  });
}
