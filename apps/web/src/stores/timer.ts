import { create } from 'zustand';

export interface StartPreset {
  taskId?: number;
  /** подпись задачи в диалоге: «#12 Название» */
  taskLabel?: string;
  /** уточнение, подставляемое в поле (например, из прошлого запуска) */
  note?: string;
}

const HIDDEN_KEY = 'taskterm.timer.hidden';
const readHidden = () => {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
};
const writeHidden = (v: boolean) => {
  try {
    if (v) localStorage.setItem(HIDDEN_KEY, '1');
    else localStorage.removeItem(HIDDEN_KEY);
  } catch {
    /* приватный режим — просто не запоминаем */
  }
};

interface TimerUi {
  /** панель таймера закреплена всегда; скрывает её только сам пользователь крестиком */
  hidden: boolean;
  setHidden: (v: boolean) => void;
  startOpen: StartPreset | null;
  stopOpen: boolean;
  openStart: (preset?: StartPreset) => void;
  openStop: () => void;
  close: () => void;
}

/** UI-состояние диалогов таймера (сам таймер живёт на сервере → TanStack Query) */
export const useTimerUi = create<TimerUi>()((set) => ({
  hidden: readHidden(),
  setHidden: (v) => {
    writeHidden(v);
    set({ hidden: v });
  },
  startOpen: null,
  stopOpen: false,
  openStart: (preset = {}) => set({ startOpen: preset, stopOpen: false }),
  openStop: () => set({ stopOpen: true, startOpen: null }),
  close: () => set({ startOpen: null, stopOpen: false }),
}));
