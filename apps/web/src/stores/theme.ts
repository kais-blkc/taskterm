import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { findPreset, THEME_TOKENS, type ThemeColors, type ThemeToken } from '../themes';

export const FONT_MIN = 11;
export const FONT_MAX = 20;

interface ThemeState {
  presetId: string;
  overrides: Partial<ThemeColors>;
  fontSize: number;
  setPreset: (id: string) => void;
  setColor: (token: ThemeToken, value: string) => void;
  setFontSize: (px: number) => void;
  reset: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      presetId: 'phosphor',
      overrides: {},
      fontSize: 14,
      // смена пресета сбрасывает ручные правки цветов
      setPreset: (presetId) => set({ presetId, overrides: {} }),
      setColor: (token, value) => set((s) => ({ overrides: { ...s.overrides, [token]: value } })),
      setFontSize: (px) => set({ fontSize: Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(px))) }),
      reset: () => set({ overrides: {}, fontSize: 14 }),
    }),
    { name: 'taskterm-theme' },
  ),
);

function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum < 128;
}

export function applyTheme(state: Pick<ThemeState, 'presetId' | 'overrides' | 'fontSize'>) {
  const colors = { ...findPreset(state.presetId).colors, ...state.overrides };
  const root = document.documentElement;
  for (const token of THEME_TOKENS) root.style.setProperty(`--${token}`, colors[token]);
  root.style.setProperty('--font-size', `${state.fontSize}px`);
  root.style.colorScheme = isDark(colors.bg) ? 'dark' : 'light';
}

export function currentColors(state: Pick<ThemeState, 'presetId' | 'overrides'>): ThemeColors {
  return { ...findPreset(state.presetId).colors, ...state.overrides };
}
