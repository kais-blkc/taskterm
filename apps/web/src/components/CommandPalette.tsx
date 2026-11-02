import { useEffect, useMemo, useRef, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { useBoard, useBoards } from '../api/boards';
import { useLogout, useMe } from '../api/auth';
import { ROUTES } from '../consts/routes';
import { MOD_KEY } from '../lib/keys';
import { notificationsSupported, useNotifyStore } from '../stores/notifications';
import { useThemeStore } from '../stores/theme';
import { useUiStore } from '../stores/ui';
import { PRESETS } from '../themes';

interface Cmd {
  id: string;
  group: 'actions' | 'boards' | 'tasks' | 'themes';
  label: string;
  hint?: string;
  run: () => void;
}

const GROUP_ORDER: Cmd['group'][] = ['actions', 'boards', 'tasks', 'themes'];

export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  if (!open) return null;
  return <PaletteInner close={() => setOpen(false)} />;
}

function PaletteInner({ close }: { close: () => void }) {
  const navigate = useNavigate();
  const boardMatch = useMatch(`${ROUTES.BOARD(':boardId')}/*`);
  const boardId = Number((boardMatch?.params as Record<string, string | undefined> | undefined)?.boardId);
  const boards = useBoards();
  const board = useBoard(boardId, Number.isFinite(boardId));
  const logout = useLogout();
  const isAdmin = useMe().data?.role === 'admin';
  const setPreset = useThemeStore((s) => s.setPreset);
  const notify = useNotifyStore();
  const { setHelpOpen, setAddTaskColumn } = useUiStore.getState();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo<Cmd[]>(() => {
    const cmds: Cmd[] = [];
    cmds.push({ id: 'home', group: 'actions', label: 'go: все доски', run: () => navigate(ROUTES.HOME) });
    if (isAdmin) cmds.push({ id: 'admin', group: 'actions', label: 'go: админ-панель', run: () => navigate(ROUTES.ADMIN) });
    if (board.data) {
      const first = board.data.columns[0];
      if (first) {
        cmds.push({
          id: 'new-task',
          group: 'actions',
          label: `new task: ${board.data.board.name}`,
          hint: 'n',
          run: () => setAddTaskColumn(first.id),
        });
      }
    }
    if (notificationsSupported()) {
      cmds.push({
        id: 'notify',
        group: 'actions',
        label: `уведомления: ${notify.enabled ? 'выключить' : 'включить'}`,
        run: async () => {
          if (notify.enabled) return notify.setEnabled(false);
          const perm =
            Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
          notify.setEnabled(perm === 'granted');
        },
      });
    }
    cmds.push({ id: 'help', group: 'actions', label: 'горячие клавиши', hint: '?', run: () => setHelpOpen(true) });
    cmds.push({ id: 'logout', group: 'actions', label: 'logout', run: () => logout.mutate() });

    for (const b of boards.data ?? []) {
      cmds.push({ id: `board-${b.id}`, group: 'boards', label: `board: ${b.name}`, run: () => navigate(ROUTES.BOARD(b.id)) });
    }
    for (const t of board.data?.tasks ?? []) {
      cmds.push({
        id: `task-${t.id}`,
        group: 'tasks',
        label: `#${t.number} ${t.title}`,
        run: () => navigate(ROUTES.TASK(t.boardId, t.id)),
      });
    }
    for (const p of PRESETS) {
      cmds.push({ id: `theme-${p.id}`, group: 'themes', label: `theme: ${p.name}`, run: () => setPreset(p.id) });
    }
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards.data, board.data, notify.enabled, navigate]);

  const results = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    let list = all.filter((c) => tokens.every((t) => c.label.toLowerCase().includes(t)));
    // задачи показываем только при вводе, иначе список бесконечный
    if (!tokens.length) list = list.filter((c) => c.group !== 'tasks');
    const tasks = list.filter((c) => c.group === 'tasks').slice(0, 8);
    return GROUP_ORDER.flatMap((g) => (g === 'tasks' ? tasks : list.filter((c) => c.group === g)));
  }, [all, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (c?: Cmd) => {
    if (!c) return;
    close();
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((i) => Math.min(i + 1, results.length - 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((i) => Math.max(i - 1, 0)));
    else if (e.key === 'Enter') (e.preventDefault(), run(results[active]));
    else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), close());
  };

  let lastGroup = '';
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-24"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="w-full max-w-xl border border-accent bg-elev shadow-2xl" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="text-muted">&gt;</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="доска, задача (#12), тема, действие…"
            className="flex-1 bg-transparent outline-none placeholder:text-muted"
          />
          <kbd className="text-xs text-muted">{MOD_KEY}+K</kbd>
        </div>
        <ul ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && <li className="px-3 py-2 text-muted">// ничего не найдено</li>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <li key={c.id}>
                {header && <div className="px-3 pt-2 text-xs text-muted">## {c.group}</div>}
                <div
                  data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(c)}
                  className={`flex cursor-pointer items-center justify-between px-3 py-1 ${
                    i === active ? 'bg-accent text-bg' : ''
                  }`}
                >
                  <span className="truncate">{c.label}</span>
                  {c.hint && <kbd className="text-xs opacity-70">{c.hint}</kbd>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
