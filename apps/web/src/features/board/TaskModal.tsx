import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { canCommentOn, canEditField, canManageTask, roleCan, type BoardRole, type Task, type User } from '@taskterm/shared';
import { useBoard, useMembers } from '../../api/boards';
import { ROUTES } from '../../consts/routes';
import { useUpdateTask } from '../../api/tasks';
import { useUsers } from '../../api/users';
import { LockHint } from '../../components/Icon';
import { Markdown } from '../../components/Markdown';
import { addDays, DUE_CLASS, dueInfo, formatDateTime } from '../../lib/dates';
import { Select } from '../../components/Select';
import { ColorDot, UserTag } from '../../components/UserTag';
import { Comments } from './Comments';
import { useTimerState } from '../../api/time';
import { useTimerUi } from '../../stores/timer';
import { Subtasks } from './Subtasks';
import { TaskRights } from './TaskRights';

/** Запуск таймера по этой задаче; если таймер уже идёт — подсказка вместо кнопки */
function TaskTimerButton({ taskId, label }: { taskId: number; label: string }) {
  const { data: timer } = useTimerState();
  if (!timer) return null;
  if (timer.status !== 'idle') {
    return <span className="task-timer-hint text-[14px]">{timer.taskId === taskId ? '● таймер идёт по этой задаче' : 'таймер уже запущен'}</span>;
  }
  return (
    <button type="button" className="task-timer-button btn" onClick={() => useTimerUi.getState().openStart({ taskId, taskLabel: label })}>
      ▶ таймер по задаче
    </button>
  );
}

function TaskBody({
  task,
  columnName,
  isFinished,
  user,
  boardId,
  role,
}: {
  task: Task;
  columnName: string;
  isFinished: boolean;
  user: User;
  boardId: number;
  role: BoardRole;
}) {
  const update = useUpdateTask(boardId);
  const users = useUsers();
  const members = useMembers(boardId);
  // править поля задачи, подзадачи и описание может редактор и выше; остальные только читают
  const actor = { role, isOwner: task.authorId === user.id };
  const canEdit = roleCan(role, 'editTask');
  const can = (f: Parameters<typeof canEditField>[2]) => canEditField(task.policy, actor, f);
  // поле закрыто политикой, хотя по роли его можно было бы менять
  const lockedBy = (f: Parameters<typeof canEditField>[2]) => canEdit && !can(f);
  const lock = <LockHint className="ml-1" text="owner задачи закрыл это поле" />;
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(task.description);

  return (
    <div className="task-body space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-muted">
          <span>
            #{task.number} · <span className="text-fg">{columnName}</span>
          </span>
          <TaskTimerButton taskId={task.id} label={`#${task.number} ${task.title}`} />
        </div>
        {editingTitle && can('title') ? (
          <input
            autoFocus
            defaultValue={task.title}
            className="task-title-input mt-1 w-full border border-accent bg-elev px-2 py-1 text-lg outline-none"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== task.title) update.mutate({ id: task.id, title: v });
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditingTitle(false);
              e.stopPropagation();
            }}
          />
        ) : (
          <h1
            className={`task-title mt-1 text-lg font-bold ${can('title') ? 'cursor-text' : ''}`}
            title={can('title') ? 'клик — редактировать' : undefined}
            onClick={() => can('title') && setEditingTitle(true)}
          >
            {task.title}
            {lockedBy('title') && lock}
          </h1>
        )}
      </div>

      <dl className="task-details grid grid-cols-1 items-center gap-y-1 sm:grid-cols-[max-content_1fr] sm:gap-x-4 border border-line bg-bg p-3">
        <dt className="mt-2 text-muted first:mt-0 sm:mt-0">owner</dt>
        <dd>
          <UserTag user={users.byId.get(task.authorId)} />
          <span className="text-muted"> · {formatDateTime(task.createdAt)}</span>
        </dd>
        <dt className="mt-2 text-muted first:mt-0 sm:mt-0">ответственные{lockedBy('assignee') && lock}</dt>
        <dd className="task-assignee flex flex-wrap items-center gap-2">
          {task.assigneeIds.length === 0 && <span className="text-muted">— не назначены —</span>}
          {task.assigneeIds.map((id) => (
            <span key={id} className="task-assignee-chip inline-flex items-center gap-1 border border-line px-1.5">
              <UserTag user={users.byId.get(id)} />
              {can('assignee') && (
                <button
                  type="button"
                  title="снять"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: task.id, assigneeIds: task.assigneeIds.filter((x) => x !== id) })}
                  className="cursor-pointer text-muted hover:text-accent"
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {can('assignee') && (
            <Select
              className="w-full sm:w-auto sm:min-w-48"
              disabled={update.isPending}
              value=""
              placeholder="+ добавить"
              options={(members.data ?? [])
                .filter((u) => !task.assigneeIds.includes(u.id))
                .map((u) => ({
                  value: String(u.id),
                  label: `@${u.username}${u.id === user.id ? ' (я)' : ''}`,
                  icon: <ColorDot color={u.color} />,
                }))}
              onChange={(v) => v && update.mutate({ id: task.id, assigneeIds: [...task.assigneeIds, Number(v)] })}
            />
          )}
          {can('assignee') && !task.assigneeIds.includes(user.id) && members.data?.some((x) => x.id === user.id) && (
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: task.id, assigneeIds: [...task.assigneeIds, user.id] })}
              className="btn"
            >
              взять себе
            </button>
          )}
        </dd>
        <dt className="mt-2 text-muted first:mt-0 sm:mt-0">дедлайн{lockedBy('dueDate') && lock}</dt>
        <dd className="task-due-date flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={task.dueDate ?? ''}
            disabled={update.isPending || !can('dueDate')}
            onChange={(e) => update.mutate({ id: task.id, dueDate: e.target.value || null })}
            className="border border-line bg-elev px-2 py-0.5 outline-none focus:border-accent"
          />
          {can('dueDate') && [
            ['сегодня', 0],
            ['завтра', 1],
            ['+7 дней', 7],
          ].map(([label, days]) => (
            <button
              key={label}
              type="button"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: task.id, dueDate: addDays(days as number) })}
              className="btn"
            >
              {label}
            </button>
          ))}
          {task.dueDate && (
            <>
              {can('dueDate') && (
                <button type="button" disabled={update.isPending} onClick={() => update.mutate({ id: task.id, dueDate: null })} className="btn btn-danger">
                  убрать
                </button>
              )}
              <span className={DUE_CLASS[dueInfo(task.dueDate, isFinished).state]}>
                {dueInfo(task.dueDate, isFinished).label}
              </span>
            </>
          )}
        </dd>
        {task.updatedAt !== task.createdAt && (
          <>
            <dt className="mt-2 text-muted first:mt-0 sm:mt-0">обновлена</dt>
            <dd className="text-muted">{formatDateTime(task.updatedAt)}</dd>
          </>
        )}
      </dl>

      <section className="task-description mt-8 space-y-2">
        <h3 className="flex justify-between">
          <span>## description{lockedBy('description') && lock}</span>
          {can('description') && !editingDesc && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setDesc(task.description);
                setEditingDesc(true);
              }}
            >
              edit
            </button>
          )}
        </h3>
        {editingDesc ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              rows={8}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="task-description-input block w-full resize-y border border-line bg-bg px-2 py-1 outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => update.mutate({ id: task.id, description: desc }, { onSuccess: () => setEditingDesc(false) })}
              >
                save
              </button>
              <button type="button" className="btn" onClick={() => setEditingDesc(false)}>
                cancel
              </button>
            </div>
          </div>
        ) : task.description ? (
          <Markdown>{task.description}</Markdown>
        ) : (
          <p className="text-muted text-[14px]">// описания нет</p>
        )}
      </section>

      {canManageTask(actor) && <TaskRights task={task} boardId={boardId} />}

      <Subtasks task={task} boardId={boardId} actor={actor} userId={user.id} />

      <Comments
        taskId={task.id}
        userId={user.id}
        canComment={canCommentOn(task.policy, actor)}
        commentsLocked={roleCan(role, 'comment') && !canCommentOn(task.policy, actor)}
        canModerate={roleCan(role, 'deleteAnyComment')}
      />
    </div>
  );
}

export function TaskModal({ user }: { user: User }) {
  const { boardId: b, taskId: t } = useParams();
  const boardId = Number(b);
  const taskId = Number(t);
  const navigate = useNavigate();
  const { data } = useBoard(boardId);
  const close = () => navigate(ROUTES.BOARD(boardId));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (e.key === 'Escape' && !typing) navigate(ROUTES.BOARD(boardId));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boardId, navigate]);

  const task = data?.tasks.find((x) => x.id === taskId);
  const column = data?.columns.find((c) => c.id === task?.columnId);

  return (
    <div className="modal-overlay task-modal-overlay fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/60 p-2 pt-4 sm:p-4 sm:pt-12" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal-dialog task-modal w-full max-w-3xl border border-accent bg-elev p-3 shadow-2xl sm:p-5">
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={close} className="task-modal-close btn btn-danger">
            close <span className="text-muted">esc</span>
          </button>
        </div>
        {!data ? (
          <p className="text-muted">loading...</p>
        ) : !task ? (
          <p className="text-danger">! task not found</p>
        ) : (
          <TaskBody
            key={task.id}
            task={task}
            columnName={column?.name ?? '?'}
            isFinished={task.columnId === data.columns.at(-1)?.id}
            user={user}
            boardId={boardId}
            role={data.board.myRole}
          />
        )}
      </div>
    </div>
  );
}
