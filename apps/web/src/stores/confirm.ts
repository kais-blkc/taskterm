import type { ReactNode } from 'react';
import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** разрушающее действие: красный акцент, фокус по умолчанию на «отмене» */
  danger?: boolean;
}

interface ConfirmState {
  opts: ConfirmOptions | null;
  resolve: ((ok: boolean) => void) | null;
  answer: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  opts: null,
  resolve: null,
  answer: (ok) => {
    get().resolve?.(ok);
    set({ opts: null, resolve: null });
  },
}));

/** Замена window.confirm: `if (await confirmDialog({ title: '...' })) { ... }` */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  // если уже открыт другой диалог — считаем его отменённым
  useConfirmStore.getState().resolve?.(false);
  return new Promise<boolean>((resolve) => useConfirmStore.setState({ opts, resolve }));
}
