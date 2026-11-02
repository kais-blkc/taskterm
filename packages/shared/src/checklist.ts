import { z } from 'zod';

export const CHECKLIST_MAX_ITEMS = 100;
export const CHECKLIST_MAX_TITLE = 200;

export interface ChecklistItem {
  title: string;
  done: boolean;
}

export const bulkSubtasksSchema = z.object({
  items: z
    .array(z.object({ title: z.string().trim().min(1).max(CHECKLIST_MAX_TITLE), done: z.boolean().optional() }))
    .min(1)
    .max(CHECKLIST_MAX_ITEMS),
});

// маркеры списка: «- », «* », «+ », «• », «– », «1. », «1) » (после маркера пробел или конец строки: «-5 градусов» остаётся текстом)
const BULLET = /^(?:[-*+•–—]|\d+[.)])(?:\s+|$)/;
// чекбокс: «[ ]», «[x]», «[х]» (в т.ч. русская «х»), «[✓]»
const CHECKBOX = /^\[([ xXхХ✓✔])\]\s*/;

/**
 * Разбирает текст в чек-лист. Понимает markdown-списки, нумерацию и чекбоксы:
 *   - пункт 1
 *   - [x] уже сделано
 *   2) ещё пункт
 *   просто строка
 * Пустые строки пропускаются, вложенность игнорируется (список плоский).
 */
export function parseChecklist(text: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(BULLET, '');
    let done = false;
    const box = CHECKBOX.exec(line);
    if (box) {
      done = box[1] !== ' ';
      line = line.slice(box[0].length);
    }
    line = line.trim().slice(0, CHECKLIST_MAX_TITLE).trim();
    if (!line) continue;
    items.push({ title: line, done });
    if (items.length >= CHECKLIST_MAX_ITEMS) break;
  }
  return items;
}
