import { create } from 'zustand';

interface UiState {
  paletteOpen: boolean;
  helpOpen: boolean;
  /** выбранная с клавиатуры карточка (h/j/k/l) */
  selectedTaskId: number | null;
  /** колонка, в которой открыто поле добавления задачи */
  addTaskColumnId: number | null;
  setPaletteOpen: (v: boolean) => void;
  setHelpOpen: (v: boolean) => void;
  selectTask: (id: number | null) => void;
  setAddTaskColumn: (id: number | null) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  paletteOpen: false,
  helpOpen: false,
  selectedTaskId: null,
  addTaskColumnId: null,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  setAddTaskColumn: (addTaskColumnId) => set({ addTaskColumnId }),
}));
