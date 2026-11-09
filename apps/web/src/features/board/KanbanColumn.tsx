import { useState } from 'react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Column, SubtaskStat, Task, User } from '@taskterm/shared';
import { Icon } from '../../components/Icon';
import { InlineAdd } from '../../components/InlineAdd';
import { confirmDialog } from '../../stores/confirm';
import { useUiStore } from '../../stores/ui';
import { ColumnNotifyDialog } from './ColumnNotifyDialog';
import { TaskCard } from './TaskCard';

export function KanbanColumn({
  boardId,
  column,
  tasks,
  userNames,
  stats,
  finished,
  meId,
  canMove,
  canCreate,
  canManage,
  canNotify,
  canDeleteTask,
  onRename,
  onSaveNotify,
  savingNotify,
  onDelete,
  onAddTask,
  onDeleteTask,
  onOpenTask,
}: {
  boardId: number;
  column: Column;
  tasks: Task[];
  userNames: Map<number, User>;
  stats: Map<number, SubtaskStat>;
  /** последняя колонка доски («Сделано») */
  finished: boolean;
  meId: number;
  /** перетаскивать задачу (роль editor и выше и политика задачи) */
  canMove: (t: Task) => boolean;
  canCreate: boolean;
  /** колонки: переименовать/удалить (owner) */
  canManage: boolean;
  /** настройка уведомлений колонки — только админ приложения */
  canNotify: boolean;
  canDeleteTask: (t: Task) => boolean;
  onRename: (name: string) => void;
  onSaveNotify: (v: { notifyOnEnter: boolean; notifyUserIds: number[] }) => void;
  savingNotify: boolean;
  onDelete: () => void;
  onAddTask: (title: string) => void;
  onDeleteTask: (id: number) => void;
  onOpenTask: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.id}`, data: { type: 'column', column } });
  // над непустой колонкой целью drop становится карточка под курсором, а не сама колонка —
  // подсвечиваем колонку и в этом случае
  const { over } = useDndContext();
  const overTask = over?.data.current?.type === 'task' ? (over.data.current.task as Task) : null;
  const highlighted = isOver || overTask?.columnId === column.id;
  const [editing, setEditing] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const selectedTaskId = useUiStore((s) => s.selectedTaskId);
  const addingHere = useUiStore((s) => s.addTaskColumnId === column.id);
  const setAddTaskColumn = useUiStore((s) => s.setAddTaskColumn);

  return (
    <section
      className={`kanban-column flex w-[85vw] max-w-72 shrink-0 snap-start sm:w-72 flex-col border bg-bg ${highlighted ? 'border-accent' : 'border-line'}`}
    >
      <header className="kanban-column-header flex items-center justify-between border-b border-line px-2 py-1.5">
        {editing ? (
          <input
            autoFocus
            defaultValue={column.name}
            className="kanban-column-rename-input w-40 border border-accent bg-elev px-1 outline-none"
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
          <h2
            className={`kanban-column-title ${canManage ? 'cursor-text' : ''}`}
            onDoubleClick={() => canManage && setEditing(true)}
            title={canManage ? 'двойной клик — переименовать' : undefined}
          >
            ## {column.name} <span className="text-muted">({tasks.length})</span>
          </h2>
        )}
        {canNotify && (
          <button
            type="button"
            title={column.notifyOnEnter ? `уведомления включены (${column.notifyUserIds.length})` : 'настроить уведомления'}
            className={`kanban-column-notify btn btn-icon ml-auto mr-1 inline-flex min-h-lh items-center ${column.notifyOnEnter ? 'btn-active' : ''}`}
            onClick={() => setNotifyOpen(true)}
          >
            <Icon name="bell" className="h-[1.1em] w-[1.1em]" />
          </button>
        )}
        {notifyOpen && (
          <ColumnNotifyDialog
            boardId={boardId}
            column={column}
            meId={meId}
            saving={savingNotify}
            onSave={onSaveNotify}
            onClose={() => setNotifyOpen(false)}
          />
        )}
        {canManage && <button
          type="button"
          title="удалить колонку"
          className="kanban-column-delete btn btn-danger btn-icon"
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
        </button>}
      </header>
      <div ref={setNodeRef} className="kanban-column-tasks flex min-h-16 flex-1 flex-col gap-2 p-2">
        <SortableContext items={tasks.map((t) => `task-${t.id}`)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              assignees={t.assigneeIds.flatMap((id) => userNames.get(id) ?? [])}
              mine={t.assigneeIds.includes(meId)}
              stat={stats.get(t.id)}
              finished={finished}
              selected={t.id === selectedTaskId}
              canDrag={canMove(t)}
              canDelete={canDeleteTask(t)}
              onDelete={() => onDeleteTask(t.id)} onOpen={() => onOpenTask(t.id)} />
          ))}
        </SortableContext>
      </div>
      {canCreate && <div className="kanban-column-add border-t border-line p-2">
        <InlineAdd
          label="task"
          placeholder="title, enter"
          onSubmit={onAddTask}
          open={addingHere}
          onOpenChange={(o) => setAddTaskColumn(o ? column.id : null)}
        />
      </div>}
    </section>
  );
}
