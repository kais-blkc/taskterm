import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NavPosition = 'top' | 'left' | 'right';

export const NAV_POSITION_LABELS: Record<NavPosition, string> = { top: 'сверху', left: 'слева', right: 'справа' };

interface LayoutState {
  /** где панель с кнопками (по умолчанию слева); на узких экранах всегда сверху */
  navPosition: NavPosition;
  setNavPosition: (p: NavPosition) => void;
  /** боковая панель в минимальном виде: только иконки */
  navCollapsed: boolean;
  setNavCollapsed: (v: boolean) => void;
}

/** Выбор пользователя о раскладке (запоминается в браузере) */
export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      navPosition: 'left',
      setNavPosition: (navPosition) => set({ navPosition }),
      navCollapsed: false,
      setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
    }),
    { name: 'taskterm-layout' },
  ),
);
