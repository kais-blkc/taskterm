import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { meSchema, resetCheckSchema, type LoginInput, type Me, type RegisterInput } from '@taskterm/shared';
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

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: LoginInput) => api<Me>(API_ENDPOINTS.AUTH_LOGIN, { method: 'POST', body: c }),
    onSuccess: (user) => qc.setQueryData(meKey, user),
  });
}

/** Регистрация по ссылке-приглашению; сервер сразу выставляет cookies, пользователь входит */
export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: RegisterInput) => api<Me>(API_ENDPOINTS.AUTH_REGISTER, { method: 'POST', body: c }),
    onSuccess: (user) => qc.setQueryData(meKey, user),
  });
}

/** Новый пароль по ссылке сброса; сервер сразу входит под этим пользователем */
export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { token: string; password: string }) => api<Me>(API_ENDPOINTS.AUTH_RESET, { method: 'POST', body: v }),
    onSuccess: (user) => qc.setQueryData(meKey, user),
  });
}

export function useResetCheck(token: string) {
  return useQuery({
    enabled: token.length > 0,
    queryKey: ['reset-check', token],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => resetCheckSchema.parse(await api(`${API_ENDPOINTS.AUTH_RESET_CHECK}?token=${encodeURIComponent(token)}`)),
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
