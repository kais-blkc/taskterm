import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userSchema, type Credentials, type User } from '@taskterm/shared';
import { API_ENDPOINTS } from '../consts/endpoints';
import { api, ApiError } from './client';

export const meKey = ['me'] as const;

export function useMe() {
  return useQuery<User | null>({
    queryKey: meKey,
    queryFn: async () => {
      try {
        return userSchema.parse(await api(API_ENDPOINTS.AUTH_ME));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function useAuth(mode: 'login' | 'register') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Credentials) => api<User>(mode === 'login' ? API_ENDPOINTS.AUTH_LOGIN : API_ENDPOINTS.AUTH_REGISTER, { method: 'POST', body: c }),
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
