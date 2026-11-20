import { create } from 'zustand';

export interface StartPreset {
  taskId?: number;
  /** подпись задачи в диалоге: «#12 Название» */
  taskLabel?: string;
  /** уточнение, подставляемое в поле (например, из прошлого запуска) */
  note?: string;
}

const COLLAPSED_KEY = 'taskterm.timer.collapsed';
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
};
const writeCollapsed = (v: boolean) => {
  try {
    if (v) localStorage.setItem(COLLAPSED_KEY, '1');
    else localStorage.removeItem(COLLAPSED_KEY);
  } catch {
    /* приватный режим — просто не запоминаем */
  }
};

interface TimerUi {
  /** панель свёрнута к правому краю: только время и кнопки пауза/старт/стоп */
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  startOpen: StartPreset | null;
  stopOpen: boolean;
  openStart: (preset?: StartPreset) => void;
  openStop: () => void;
  close: () => void;
}

/** UI-состояние диалогов таймера (сам таймер живёт на сервере → TanStack Query) */
export const useTimerUi = create<TimerUi>()((set) => ({
  collapsed: readCollapsed(),
  setCollapsed: (v) => {
    writeCollapsed(v);
    set({ collapsed: v });
  },
  startOpen: null,
  stopOpen: false,
  openStart: (preset = {}) => set({ startOpen: preset, stopOpen: false }),
  openStop: () => set({ stopOpen: true, startOpen: null }),
  close: () => set({ startOpen: null, stopOpen: false }),
}));
