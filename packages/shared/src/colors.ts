import { z } from 'zod';

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'формат #rrggbb');

/** Минимальная «расстояние» между цветами разных пользователей (шкала redmean, макс ≈ 765) */
export const COLOR_MIN_DISTANCE = 70;

export const USER_PALETTE = [
  '#ff5f56', '#ff8a3d', '#ffb000', '#e5d84a', '#a3e635', '#33ff99', '#2dd4bf', '#22d3ee',
  '#4da3ff', '#7c83ff', '#bd93f9', '#e879f9', '#ff5fa2', '#c28f5c', '#94a3b8',
] as const;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Перцептивно-приближённое расстояние между цветами (формула «redmean») */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/** Ближайший занятый цвет в пределах порога или null */
export function findSimilar<T extends { color: string }>(color: string, others: T[]): T | null {
  return others.find((o) => o.color && colorDistance(color, o.color) < COLOR_MIN_DISTANCE) ?? null;
}

/** Случайный цвет, максимально непохожий на уже занятые */
export function pickDistinctColor(taken: string[], candidates = 300): string {
  let best = USER_PALETTE[0] as string;
  let bestScore = -1;
  for (let i = 0; i < candidates; i++) {
    const c = hslToHex(Math.random() * 360, 65 + Math.random() * 25, 55 + Math.random() * 13);
    const score = taken.length ? Math.min(...taken.map((t) => colorDistance(c, t))) : 999;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}
