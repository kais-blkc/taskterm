import { useEffect, useMemo, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { canDeleteTask, canEditField, roleCan, type BoardFull, type Task } from '@taskterm/shared';
import { useMe } from '../../api/auth';
import { ROUTES } from '../../consts/routes';
import { daysUntil } from '../../lib/dates';
import { isTyping } from '../../lib/keys';
import { useUiStore } from '../../stores/ui';
import { useBoardMutations } from '../../api/boards';
import { useUsers } from '../../api/users';
import { InlineAdd } from '../../components/InlineAdd';
import { Select } from '../../components/Select';
import { ColorDot } from '../../components/UserTag';
import { KanbanColumn } from './KanbanColumn';
import { TaskCardView } from './TaskCard';

export function BoardView({ data }: { data: BoardFull }) {
  const m = useBoardMutations(data.board.id);
  const navigate = useNavigate();
  const [active, setActive] = useState<Task | null>(null);
  const me = useMe().data;
  const meId = me?.id ?? -1;
  const users = useUsers();
  // 'all' | 'me' | 'none' | id исполнителя
  const [filter, setFilter] = useState<string>('all');
  const role = data.board.myRole;
  const canEdit = roleCan(role, 'editTask');
  const canCreate = roleCan(role, 'createTask');
  const canManage = roleCan(role, 'manageBoard');
  const canMove = (t: Task) => canEditField(t.policy, { role, isOwner: t.authorId === meId }, 'move');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const lastColumnId = data.columns.at(-1)?.id;
  const statsByTask = useMemo(() => new Map(data.subtaskStats.map((s) => [s.taskId, s])), [data.subtaskStats]);

  // порядок задач берём из массива (сервер отдаёт по position, optimistic-update сохраняет порядок)
  const byColumn = useMemo(() => {
    const map = new Map<number, Task[]>(data.columns.map((c) => [c.id, []]));
    for (const t of data.tasks) {
      const ok =
        filter === 'all' ||
        (filter === 'me' && t.assigneeId === meId) ||
        (filter === 'none' && t.assigneeId === null) ||
        (filter === 'overdue' && !!t.dueDate && t.columnId !== lastColumnId && daysUntil(t.dueDate) < 0) ||
        String(t.assigneeId) === filter;
      if (ok) map.get(t.columnId)?.push(t);
    }
    return map;
  }, [data, filter, meId, lastColumnId]);

  // во время перетаскивания курсор «grabbing» по всей странице, а не только над карточкой
  const setDragCursor = (on: boolean) => {
    document.body.style.cursor = on ? 'grabbing' : '';
  };

  // ── горячие клавиши доски: h/j/k/l, Enter/o, n, Esc ──
  const taskModalOpen = useMatch(ROUTES.TASK(':boardId', ':taskId')) !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping() || taskModalOpen) return;
      const ui = useUiStore.getState();
      if (ui.paletteOpen || ui.helpOpen) return;

      const cols = data.columns.map((c) => byColumn.get(c.id) ?? []);
      let ci = -1;
      let ri = -1;
      cols.forEach((list, i) => {
        const r = list.findIndex((t) => t.id === ui.selectedTaskId);
        if (r !== -1) [ci, ri] = [i, r];
      });
      const select = (t?: Task) => {
        if (!t) return;
        ui.selectTask(t.id);
        document.querySelector(`[data-task-id="${t.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      };

      const horizontal = (step: 1 | -1) => {
        let j = ci + step;
        while (j >= 0 && j < cols.length && cols[j]!.length === 0) j += step;
        const list = cols[j];
        if (list) select(list[Math.min(ri, list.length - 1)]);
      };

      switch (e.key) {
        case 'j':
        case 'k':
        case 'h':
        case 'l': {
          e.preventDefault();
          if (ci === -1) return select(cols.find((l) => l.length)?.[0]);
          const list = cols[ci]!;
          if (e.key === 'j') select(list[Math.min(ri + 1, list.length - 1)]);
          if (e.key === 'k') select(list[Math.max(ri - 1, 0)]);
          if (e.key === 'h') horizontal(-1);
          if (e.key === 'l') horizontal(1);
          return;
        }
        case 'Enter':
        case 'o':
          if (ci !== -1) {
            e.preventDefault();
            navigate(ROUTES.TASK(data.board.id, ui.selectedTaskId!));
          }
          return;
        case 'n': {
          e.preventDefault();
          if (!canCreate) return;
          const colId = ci !== -1 ? data.columns[ci]!.id : data.columns[0]?.id;
          if (colId !== undefined) ui.setAddTaskColumn(colId);
          return;
        }
        case 'Escape':
          ui.selectTask(null);
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, byColumn, navigate, taskModalOpen, canCreate]);

  const onDragStart = (e: DragStartEvent) => {
    setDragCursor(true);
    setActive((e.active.data.current?.task as Task) ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragCursor(false);
    setActive(null);
    const task = e.active.data.current?.task as Task | undefined;
    const over = e.over;
    if (!task || !over || !canMove(task)) return;

    const overData = over.data.current;
    if (overData?.type === 'column') {
      const colId = overData.column.id as number;
      // уже последняя в этой колонке — ничего не меняется
      if (task.columnId === colId && byColumn.get(colId)?.at(-1)?.id === task.id) return;
      m.moveTask.mutate({ id: task.id, columnId: colId, beforeId: null });
      return;
    }
    if (overData?.type === 'task') {
      const target = overData.task as Task;
      if (target.id === task.id) return;
      const list = byColumn.get(target.columnId) ?? [];
      const overIdx = list.findIndex((t) => t.id === target.id);
      const activeIdx = list.findIndex((t) => t.id === task.id);
      // внутри колонки при движении вниз вставляем ПОСЛЕ целевой, иначе — перед ней
      const movingDown = activeIdx !== -1 && activeIdx < overIdx;
      const before = movingDown ? (list[overIdx + 1] ?? null) : target;
      m.moveTask.mutate({ id: task.id, columnId: target.columnId, beforeId: before?.id ?? null });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragCursor(false);
        setActive(null);
      }}
    >
      <div className="board-filters flex flex-wrap items-center gap-2 px-4 pt-3 text-muted">
        <span>filter:</span>
        {[
          ['all', 'все'],
          ['me', 'мои'],
          ['none', 'не назначены'],
          ['overdue', 'просрочены'],
        ].map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setFilter(v!)}
            className={`board-filter-button btn ${filter === v ? 'btn-active' : ''}`}
          >
            {label}
          </button>
        ))}
        <Select
          className="w-40"
          value={/^\d+$/.test(filter) ? filter : ''}
          placeholder="@user…"
          options={(users.data ?? []).map((u) => ({ value: String(u.id), label: `@${u.username}`, icon: <ColorDot color={u.color} /> }))}
          onChange={setFilter}
        />
      </div>
      <div className="board-columns flex items-start gap-3 overflow-x-auto p-4">
        {data.columns.map((c) => (
          <KanbanColumn
            key={c.id}
            column={c}
            tasks={byColumn.get(c.id) ?? []}
            userNames={users.byId}
            stats={statsByTask}
            finished={c.id === lastColumnId}
            meId={meId}
            canMove={canMove}
            canCreate={canCreate}
            canManage={canManage}
            canDeleteTask={(t) => canDeleteTask(role, t.authorId === meId)}
            onRename={(name) => m.renameColumn.mutate({ id: c.id, name })}
            onDelete={() => m.deleteColumn.mutate(c.id)}
            onAddTask={(title) => m.addTask.mutate({ columnId: c.id, title })}
            onDeleteTask={(id) => m.deleteTask.mutate(id)}
            onOpenTask={(id) => navigate(ROUTES.TASK(data.board.id, id))}
          />
        ))}
        {canManage && (
          <div className="board-add-column w-60 shrink-0 pt-1">
            <InlineAdd label="column" placeholder="column name, enter" onSubmit={(name) => m.addColumn.mutate(name)} />
          </div>
        )}
      </div>
      <DragOverlay>{active && (
          <TaskCardView
            task={active}
            dragging
            assignee={active.assigneeId ? users.byId.get(active.assigneeId) : undefined}
            mine={active.assigneeId === meId}
            stat={statsByTask.get(active.id)}
            finished={active.columnId === lastColumnId}
          />
        )}</DragOverlay>
    </DndContext>
  );
}
