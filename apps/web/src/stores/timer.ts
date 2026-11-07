import { create } from 'zustand';

export interface StartPreset {
  taskId?: number;
  /** подпись задачи в диалоге: «#12 Название» */
  taskLabel?: string;
}

interface TimerUi {
  startOpen: StartPreset | null;
  stopOpen: boolean;
  openStart: (preset?: StartPreset) => void;
  openStop: () => void;
  close: () => void;
}

/** UI-состояние диалогов таймера (сам таймер живёт на сервере → TanStack Query) */
export const useTimerUi = create<TimerUi>()((set) => ({
  startOpen: null,
  stopOpen: false,
  openStart: (preset = {}) => set({ startOpen: preset, stopOpen: false }),
  openStop: () => set({ stopOpen: true, startOpen: null }),
  close: () => set({ startOpen: null, stopOpen: false }),
}));
