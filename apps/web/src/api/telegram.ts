import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { telegramLinkSchema, telegramStatusSchema } from '@taskterm/shared';
import { API_ENDPOINTS } from '../consts/endpoints';
import { api } from './client';

const key = ['telegram'] as const;

/** Статус привязки; пока ждём, что пользователь нажмёт Start в боте, опрашиваем каждые 3 с */
export function useTelegram(waiting = false) {
  return useQuery({
    queryKey: key,
    queryFn: async () => telegramStatusSchema.parse(await api(API_ENDPOINTS.TELEGRAM)),
    refetchInterval: waiting ? 3000 : false,
  });
}

export function useTelegramMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  return {
    link: useMutation({
      mutationFn: async () => telegramLinkSchema.parse(await api(API_ENDPOINTS.TELEGRAM_LINK, { method: 'POST' })),
    }),
    unlink: useMutation({
      mutationFn: () => api<void>(API_ENDPOINTS.TELEGRAM, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}
