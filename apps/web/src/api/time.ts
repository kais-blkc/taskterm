import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  duePayoutSchema,
  liveTimerSchema,
  myEntriesSchema,
  payoutSchema,
  timeReportSchema,
  timerSettingsSchema,
  timerStateSchema,
  timeEntrySchema,
  type MarkPaidInput,
  type StartTimerInput,
  type UpdateTimerSettings,
} from '@taskterm/shared';
import { z } from 'zod';
import { API_BASE, API_ENDPOINTS } from '../consts/endpoints';
import { api } from './client';

/** Корень всех запросов таймера: свои чужие события `time` по SSE сбрасывают его целиком */
export const timeKey = ['time'] as const;
const stateKey = [...timeKey, 'state'] as const;

export function useTimerState() {
  return useQuery({
    queryKey: stateKey,
    queryFn: async () => timerStateSchema.parse(await api(API_ENDPOINTS.TIME_STATE)),
    // таймер могут остановить в другой вкладке/устройстве — подстраховка к SSE
    refetchInterval: 60_000,
  });
}

export function useTimeSettings() {
  return useQuery({
    queryKey: [...timeKey, 'settings'],
    queryFn: async () => timerSettingsSchema.parse(await api(API_ENDPOINTS.TIME_SETTINGS)),
    staleTime: 5 * 60_000,
  });
}

export function useTimerActions() {
  const qc = useQueryClient();
  const done = (state: unknown) => {
    qc.setQueryData(stateKey, timerStateSchema.parse(state));
    void qc.invalidateQueries({ queryKey: timeKey });
  };
  const post = (path: string, body?: unknown) => async () => done(await api(path, { method: 'POST', body }));
  return {
    start: useMutation({
      mutationFn: async (v: StartTimerInput) => done(await api(API_ENDPOINTS.TIME_START, { method: 'POST', body: v })),
    }),
    pause: useMutation({ mutationFn: post(API_ENDPOINTS.TIME_PAUSE) }),
    resume: useMutation({ mutationFn: post(API_ENDPOINTS.TIME_RESUME) }),
    stop: useMutation({
      mutationFn: async (endedAt?: string) => done(await api(API_ENDPOINTS.TIME_STOP, { method: 'POST', body: { endedAt } })),
    }),
  };
}

export function useMyEntries(from: string, to: string) {
  return useQuery({
    queryKey: [...timeKey, 'entries', from, to],
    queryFn: async () => myEntriesSchema.parse(await api(`${API_ENDPOINTS.TIME_ENTRIES}?from=${from}&to=${to}`)),
  });
}

export function useEntryMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: timeKey });
  return {
    create: useMutation({
      mutationFn: async (v: { taskId?: number | null; note: string; startedAt: string; endedAt: string }) =>
        timeEntrySchema.parse(await api(API_ENDPOINTS.TIME_ENTRIES, { method: 'POST', body: v })),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: async (v: { id: number; note?: string; startedAt?: string; endedAt?: string }) =>
        timeEntrySchema.parse(
          await api(API_ENDPOINTS.TIME_ENTRY_ITEM(v.id), { method: 'PATCH', body: { note: v.note, startedAt: v.startedAt, endedAt: v.endedAt } }),
        ),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api<void>(API_ENDPOINTS.TIME_ENTRY_ITEM(id), { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}

// ---- админ ----

export function useLiveTimers() {
  return useQuery({
    queryKey: [...timeKey, 'live'],
    queryFn: async () => z.array(liveTimerSchema).parse(await api(API_ENDPOINTS.ADMIN_TIME_LIVE)),
    refetchInterval: 60_000,
  });
}

export function useTimeReport(from: string, to: string) {
  return useQuery({
    queryKey: [...timeKey, 'report', from, to],
    queryFn: async () => timeReportSchema.parse(await api(`${API_ENDPOINTS.ADMIN_TIME_REPORT}?from=${from}&to=${to}`)),
    enabled: from <= to,
  });
}

export const reportCsvUrl = (from: string, to: string, view: 'users' | 'projects' = 'users') =>
  `${API_BASE}${API_ENDPOINTS.ADMIN_TIME_REPORT_CSV}?from=${from}&to=${to}${view === 'projects' ? '&view=projects' : ''}`;

export function useSaveTimeSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: UpdateTimerSettings) =>
      timerSettingsSchema.parse(await api(API_ENDPOINTS.ADMIN_TIME_SETTINGS, { method: 'PUT', body: v })),
    onSuccess: () => qc.invalidateQueries({ queryKey: timeKey }),
  });
}

/** История выплат (новые сверху) */
export function usePayouts() {
  return useQuery({
    queryKey: [...timeKey, 'payouts'],
    queryFn: async () => z.array(payoutSchema).parse(await api(API_ENDPOINTS.ADMIN_TIME_PAYOUTS)),
  });
}

/** Невыплаченное при наступившем сроке */
export function useDuePayouts() {
  return useQuery({
    queryKey: [...timeKey, 'payouts-due'],
    queryFn: async () => z.array(duePayoutSchema).parse(await api(API_ENDPOINTS.ADMIN_TIME_PAYOUTS_DUE)),
  });
}

export function usePayoutMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: timeKey });
  return {
    markPaid: useMutation({
      mutationFn: async (v: MarkPaidInput) => payoutSchema.parse(await api(API_ENDPOINTS.ADMIN_TIME_PAYOUTS, { method: 'POST', body: v })),
      onSuccess: refresh,
    }),
    undo: useMutation({
      mutationFn: (id: number) => api<void>(API_ENDPOINTS.ADMIN_TIME_PAYOUT_ITEM(id), { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}
