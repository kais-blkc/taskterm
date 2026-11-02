import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SubtaskStat, Task, User } from '@taskterm/shared';
import { UserTag } from '../../components/UserTag';
import { DUE_CLASS, dueInfo } from '../../lib/dates';
import { confirmDialog } from '../../stores/confirm';

export function TaskCardView({
  task,
  dragging,
  assignee,
  mine,
  stat,
  finished,
}: {
  task: Task;
  dragging?: boolean;
  assignee?: User;
  mine?: boolean;
  stat?: SubtaskStat;
  /** задача в последней колонке — дедлайн больше не горит */
  finished?: boolean;
}) {
  const due = task.dueDate ? dueInfo(task.dueDate, !!finished) : null;
  return (
    <div
      style={assignee ? { borderLeft: `3px solid ${assignee.color}` } : undefined}
      className={`border bg-elev px-2 py-1.5 ${dragging ? 'cursor-grabbing border-accent shadow-lg' : 'border-line hover:border-accent'}`}
    >
      <span className="text-muted">#{task.number}</span> {task.title}
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          → {assignee ? <UserTag user={assignee} /> : 'не назначена'}
          {mine && ' (я)'}
        </span>
        <span className="flex items-center gap-2">
          {due && (
            <span title={`дедлайн: ${task.dueDate}`} className={DUE_CLASS[due.state]}>
              ⏱ {due.label}
            </span>
          )}
        {stat && (
          <span title="подзадачи" className={stat.done === stat.total ? 'text-accent' : ''}>
            ☑ {stat.done}/{stat.total}
          </span>
        )}
        </span>
      </div>
    </div>
  );
}

export function TaskCard({
  task,
  assignee,
  mine,
  stat,
  finished,
  selected,
  onDelete,
  onOpen,
}: {
  task: Task;
  assignee?: User;
  mine?: boolean;
  stat?: SubtaskStat;
  finished?: boolean;
  selected?: boolean;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: `task-${task.id}`,
    data: { type: 'task', task },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      data-task-id={task.id}
      className={`group relative cursor-grab touch-none active:cursor-grabbing ${selected ? 'outline outline-2 outline-offset-1 outline-accent' : ''}`}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <TaskCardView task={task} assignee={assignee} mine={mine} stat={stat} finished={finished} />
      <button
        type="button"
        title="delete"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={async (e) => {
          e.stopPropagation();
          const ok = await confirmDialog({
            title: `Удалить задачу #${task.number}?`,
            message: `«${task.title}» и все её комментарии будут удалены без возможности восстановления.`,
            danger: true,
          });
          if (ok) onDelete();
        }}
        className="btn btn-danger btn-icon absolute right-1 top-1 hidden bg-elev group-hover:inline-flex"
      >
        ×
      </button>
    </div>
  );
}
