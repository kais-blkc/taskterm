import { useEffect } from 'react';
import { MOD_KEY } from '../lib/keys';
import { useUiStore } from '../stores/ui';

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'глобально',
    items: [
      [`${MOD_KEY}+K`, 'командная палитра'],
      ['?', 'эта подсказка'],
      ['Esc', 'закрыть окно / снять выбор'],
    ],
  },
  {
    title: 'доска',
    items: [
      ['h j k l', 'выбор карточки (← ↓ ↑ →)'],
      ['Enter / o', 'открыть выбранную задачу'],
      ['n', 'новая задача (в колонке выбранной карточки)'],
    ],
  },
  {
    title: 'палитра',
    items: [
      ['↑ ↓', 'навигация'],
      ['Enter', 'выполнить'],
      ['#12', 'найти задачу по номеру'],
    ],
  },
];

export function HelpOverlay() {
  const open = useUiStore((s) => s.helpOpen);
  const setOpen = useUiStore((s) => s.setHelpOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === '?') && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 p-4 pt-24"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="w-full max-w-lg space-y-4 border border-accent bg-elev p-5 shadow-2xl">
        <h2>$ taskterm --help</h2>
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="mb-1 text-muted">## {g.title}</h3>
            <dl className="grid grid-cols-[9rem_1fr] gap-y-1">
              {g.items.map(([k, d]) => (
                <div key={k} className="contents">
                  <dt>
                    <kbd className="border border-line bg-bg px-1.5 py-0.5">{k}</kbd>
                  </dt>
                  <dd>{d}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
