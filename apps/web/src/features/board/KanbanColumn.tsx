import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Column, SubtaskStat, Task, User } from '@taskterm/shared';
import { InlineAdd } from '../../components/InlineAdd';
import { confirmDialog } from '../../stores/confirm';
import { useUiStore } from '../../stores/ui';
import { TaskCard } from './TaskCard';

export function KanbanColumn({
  column,
  tasks,
  userNames,
  stats,
  finished,
  meId,
  onRename,
  onDelete,
  onAddTask,
  onDeleteTask,
  onOpenTask,
}: {
  column: Column;
  tasks: Task[];
  userNames: Map<number, User>;
  stats: Map<number, SubtaskStat>;
  /** последняя колонка доски («Сделано») */
  finished: boolean;
  meId: number;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddTask: (title: string) => void;
  onDeleteTask: (id: number) => void;
  onOpenTask: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.id}`, data: { type: 'column', column } });
  const [editing, setEditing] = useState(false);
  const selectedTaskId = useUiStore((s) => s.selectedTaskId);
  const addingHere = useUiStore((s) => s.addTaskColumnId === column.id);
  const setAddTaskColumn = useUiStore((s) => s.setAddTaskColumn);

  return (
    <section
      className={`flex w-72 shrink-0 flex-col border bg-bg ${isOver ? 'border-accent' : 'border-line'}`}
    >
      <header className="flex items-center justify-between border-b border-line px-2 py-1.5">
        {editing ? (
          <input
            autoFocus
            defaultValue={column.name}
            className="w-40 border border-accent bg-elev px-1 outline-none"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== column.name) onRename(v);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <h2 className="cursor-text" onDoubleClick={() => setEditing(true)} title="двойной клик — переименовать">
            ## {column.name} <span className="text-muted">({tasks.length})</span>
          </h2>
        )}
        <button
          type="button"
          title="удалить колонку"
          className="btn btn-danger btn-icon"
          onClick={async () => {
            const ok = await confirmDialog({
              title: `Удалить колонку «${column.name}»?`,
              message: tasks.length
                ? `Вместе с ней удалятся все задачи в ней: ${tasks.length} шт. и их комментарии.`
                : 'Колонка пуста.',
              danger: true,
            });
            if (ok) onDelete();
          }}
        >
          ×
        </button>
      </header>
      <div ref={setNodeRef} className="flex min-h-16 flex-1 flex-col gap-2 p-2">
        <SortableContext items={tasks.map((t) => `task-${t.id}`)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              assignee={t.assigneeId ? userNames.get(t.assigneeId) : undefined}
              mine={t.assigneeId === meId}
              stat={stats.get(t.id)}
              finished={finished}
              selected={t.id === selectedTaskId}
              onDelete={() => onDeleteTask(t.id)} onOpen={() => onOpenTask(t.id)} />
          ))}
        </SortableContext>
      </div>
      <div className="border-t border-line p-2">
        <InlineAdd
          label="task"
          placeholder="title, enter"
          onSubmit={onAddTask}
          open={addingHere}
          onOpenChange={(o) => setAddTaskColumn(o ? column.id : null)}
        />
      </div>
    </section>
  );
}
