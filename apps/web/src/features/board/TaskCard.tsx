import { Icon } from '../../components/Icon';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SubtaskStat, Task, User } from '@taskterm/shared';
import { UserTag } from '../../components/UserTag';
import { DUE_CLASS, dueInfo } from '../../lib/dates';
import { confirmDialog } from '../../stores/confirm';

export function TaskCardView({
  task,
  dragging,
  assignees,
  mine,
  stat,
  attachments,
  finished,
}: {
  task: Task;
  dragging?: boolean;
  assignees: User[];
  mine?: boolean;
  stat?: SubtaskStat;
  /** сколько файлов прикреплено */
  attachments?: number;
  /** задача в последней колонке — дедлайн больше не горит */
  finished?: boolean;
}) {
  const due = task.dueDate ? dueInfo(task.dueDate, !!finished) : null;
  return (
    <div
      style={assignees[0] ? { borderLeft: `3px solid ${assignees[0].color}` } : undefined}
      className={`task-card border bg-elev px-2 py-1.5 ${dragging ? 'cursor-grabbing border-accent shadow-lg' : 'border-line hover:border-accent'}`}
    >
      <span className="text-muted">#{task.number}</span> {task.title}
      <div className="task-card-meta mt-1 flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          →{' '}
          {assignees.length ? (
            <>
              {assignees.slice(0, 3).map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ', '}
                  <UserTag user={a} />
                </span>
              ))}
              {assignees.length > 3 && <span title={assignees.slice(3).map((a) => `@${a.username}`).join(', ')}> +{assignees.length - 3}</span>}
            </>
          ) : (
            'не назначена'
          )}
          {mine && ' (я)'}
        </span>
        <span className="flex items-center gap-2">
          {due && (
            <span title={`дедлайн: ${task.dueDate}`} className={DUE_CLASS[due.state]}>
              ⏱ {due.label}
            </span>
          )}
        {!!attachments && (
          <span title="файлы" className="task-card-files">
            <Icon name="clip" className="mr-1 align-[-0.125em]" />
            {attachments}
          </span>
        )}
        {stat && (
          <span title="подзадачи" className={stat.done === stat.total ? 'text-accent' : ''}>
            <Icon name="checklist" className="mr-1 align-[-0.125em]" />
            {stat.done}/{stat.total}
          </span>
        )}
        </span>
      </div>
      {!!stat?.assignees.length && (
        // кому какие подзадачи: «бэк 2/5, фронт 1/3» (исполнители подзадач всегда среди ответственных задачи)
        <div className="task-card-subtask-owners mt-1 flex flex-wrap gap-x-2 text-xs text-muted" title="подзадачи по исполнителям: сделано/всего">
          {stat.assignees.slice(0, 3).map((a) => (
            <span key={a.userId} className="task-card-subtask-owner">
              <UserTag user={assignees.find((u) => u.id === a.userId)} fallback="?" /> <span className={a.done === a.total ? 'text-accent' : ''}>{a.done}/{a.total}</span>
            </span>
          ))}
          {stat.assignees.length > 3 && <span>+{stat.assignees.length - 3}</span>}
        </div>
      )}
    </div>
  );
}

export function TaskCard({
  task,
  assignees,
  mine,
  stat,
  attachments,
  finished,
  selected,
  canDrag,
  canDelete,
  onDelete,
  onOpen,
}: {
  task: Task;
  assignees: User[];
  mine?: boolean;
  stat?: SubtaskStat;
  attachments?: number;
  finished?: boolean;
  selected?: boolean;
  canDrag: boolean;
  canDelete: boolean;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: `task-${task.id}`,
    data: { type: 'task', task },
    disabled: !canDrag,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      data-task-id={task.id}
      className={`task-card-sortable group relative ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${selected ? 'outline outline-2 outline-offset-1 outline-accent' : ''}`}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <TaskCardView task={task} assignees={assignees} mine={mine} stat={stat} attachments={attachments} finished={finished} />
      {canDelete && <button
        type="button"
        title="удалить"
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
        className="task-card-delete btn btn-danger btn-icon absolute right-1 top-1 hidden bg-elev group-hover:inline-flex [@media(hover:none)]:inline-flex"
      >
        ×
      </button>}
    </div>
  );
}
