export const THEME_TOKENS = ['bg', 'bg-elev', 'fg', 'fg-muted', 'accent', 'border', 'danger'] as const;
export type ThemeToken = (typeof THEME_TOKENS)[number];
export type ThemeColors = Record<ThemeToken, string>;

export interface ThemePreset {
  id: string;
  name: string;
  colors: ThemeColors;
}

export const PRESETS: ThemePreset[] = [
  {
    id: 'phosphor',
    name: 'фосфор (тёмная)',
    colors: { bg: '#0c0d0d', 'bg-elev': '#151716', fg: '#e6e8e7', 'fg-muted': '#8b918e', accent: '#33ff99', border: '#2a2f2c', danger: '#ff5f56' },
  },
  {
    id: 'amber',
    name: 'янтарь (тёмная)',
    colors: { bg: '#0f0e0c', 'bg-elev': '#181715', fg: '#ebe8e2', 'fg-muted': '#98938a', accent: '#ffb000', border: '#34312b', danger: '#ff5f56' },
  },
  {
    id: 'dracula',
    name: 'дракула (тёмная)',
    colors: { bg: '#1e1f29', 'bg-elev': '#282a36', fg: '#f8f8f2', 'fg-muted': '#7a7f9c', accent: '#bd93f9', border: '#44475a', danger: '#ff5555' },
  },
  {
    id: 'paper',
    name: 'бумага (светлая)',
    colors: { bg: '#f6f4ee', 'bg-elev': '#ffffff', fg: '#1d2420', 'fg-muted': '#6b746e', accent: '#0a7d4b', border: '#d5d2c6', danger: '#c62828' },
  },
  {
    id: 'solar-light',
    name: 'солнечная (светлая)',
    colors: { bg: '#fdf6e3', 'bg-elev': '#eee8d5', fg: '#586e75', 'fg-muted': '#93a1a1', accent: '#268bd2', border: '#d8d2bd', danger: '#dc322f' },
  },
];

export function findPreset(id: string): ThemePreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0]!;
}
