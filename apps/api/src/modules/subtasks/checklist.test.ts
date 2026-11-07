import { describe, expect, it } from 'vitest';
import { CHECKLIST_MAX_ITEMS, parseChecklist } from '@taskterm/shared';

const t = (s: string) => parseChecklist(s).map((i) => [i.title, i.done]);

describe('parseChecklist', () => {
  it('parses dash, star, plus and bullet markers', () => {
    expect(t('- один\n* два\n+ три\n• четыре')).toEqual([
      ['один', false],
      ['два', false],
      ['три', false],
      ['четыре', false],
    ]);
  });

  it('parses numbered lists', () => {
    expect(t('1. раз\n2) два\n10. десять')).toEqual([
      ['раз', false],
      ['два', false],
      ['десять', false],
    ]);
  });

  it('parses checkboxes, including russian х and uppercase X', () => {
    expect(t('- [ ] a\n- [x] b\n- [X] c\n- [х] d\n[ ] e\n[x] f')).toEqual([
      ['a', false],
      ['b', true],
      ['c', true],
      ['d', true],
      ['e', false],
      ['f', true],
    ]);
  });

  it('keeps plain lines, skips blanks, ignores indentation and CRLF', () => {
    expect(t('первая\r\n\r\n   - вложенная\r\n\t* ещё\r\n   ')).toEqual([
      ['первая', false],
      ['вложенная', false],
      ['ещё', false],
    ]);
  });

  it('does not treat a dash without space as a marker', () => {
    expect(t('-5 градусов\n--flag')).toEqual([
      ['-5 градусов', false],
      ['--flag', false],
    ]);
  });

  it('drops empty items, caps item count, keeps long titles', () => {
    expect(t('-\n- [ ]\n*   \n- ok')).toEqual([['ok', false]]);
    expect(parseChecklist('- ' + 'я'.repeat(5000))[0]!.title).toHaveLength(5000);
    expect(parseChecklist(Array.from({ length: 300 }, (_, i) => `- п${i}`).join('\n'))).toHaveLength(CHECKLIST_MAX_ITEMS);
  });

  it('returns empty for empty input', () => {
    expect(parseChecklist('')).toEqual([]);
    expect(parseChecklist('\n \n')).toEqual([]);
  });
});
