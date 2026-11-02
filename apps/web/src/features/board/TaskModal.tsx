import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Task, User } from '@taskterm/shared';
import { useBoard } from '../../api/boards';
import { ROUTES } from '../../consts/routes';
import { useUpdateTask } from '../../api/tasks';
import { useUsers } from '../../api/users';
import { Markdown } from '../../components/Markdown';
import { addDays, DUE_CLASS, dueInfo } from '../../lib/dates';
import { Select } from '../../components/Select';
import { ColorDot, UserTag } from '../../components/UserTag';
import { Comments } from './Comments';
import { Subtasks } from './Subtasks';

function TaskBody({
  task,
  columnName,
  isFinished,
  user,
  boardId,
}: {
  task: Task;
  columnName: string;
  isFinished: boolean;
  user: User;
  boardId: number;
}) {
  const update = useUpdateTask(boardId);
  const users = useUsers();
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(task.description);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-muted">
          #{task.number} · <span className="text-fg">{columnName}</span>
        </div>
        {editingTitle ? (
          <input
            autoFocus
            defaultValue={task.title}
            className="mt-1 w-full border border-accent bg-elev px-2 py-1 text-lg outline-none"
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
            className="mt-1 cursor-text text-lg font-bold"
            title="клик — редактировать"
            onClick={() => setEditingTitle(true)}
          >
            {task.title}
          </h1>
        )}
      </div>

      <dl className="grid grid-cols-[7rem_1fr] items-center gap-y-1 border border-line bg-bg p-3">
        <dt className="text-muted">создал</dt>
        <dd>
          <UserTag user={users.byId.get(task.authorId)} />
          <span className="text-muted"> · {task.createdAt}</span>
        </dd>
        <dt className="text-muted">ответственный</dt>
        <dd className="flex flex-wrap items-center gap-3">
          <Select
            className="min-w-48"
            disabled={update.isPending}
            value={task.assigneeId ? String(task.assigneeId) : ''}
            placeholder="— не назначен —"
            options={[
              { value: '', label: '— не назначен —' },
              ...(users.data ?? []).map((u) => ({
                value: String(u.id),
                label: `@${u.username}${u.id === user.id ? ' (я)' : ''}`,
                icon: <ColorDot color={u.color} />,
              })),
            ]}
            onChange={(v) => update.mutate({ id: task.id, assigneeId: v ? Number(v) : null })}
          />
          {task.assigneeId !== user.id && (
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: task.id, assigneeId: user.id })}
              className="btn"
            >
              взять себе
            </button>
          )}
        </dd>
        <dt className="text-muted">дедлайн</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={task.dueDate ?? ''}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ id: task.id, dueDate: e.target.value || null })}
            className="border border-line bg-elev px-2 py-0.5 outline-none focus:border-accent"
          />
          {[
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
              <button type="button" disabled={update.isPending} onClick={() => update.mutate({ id: task.id, dueDate: null })} className="btn btn-danger">
                убрать
              </button>
              <span className={DUE_CLASS[dueInfo(task.dueDate, isFinished).state]}>
                {dueInfo(task.dueDate, isFinished).label}
              </span>
            </>
          )}
        </dd>
        {task.updatedAt !== task.createdAt && (
          <>
            <dt className="text-muted">обновлена</dt>
            <dd className="text-muted">{task.updatedAt}</dd>
          </>
        )}
      </dl>

      <section className="space-y-2">
        <h3 className="flex justify-between">
          <span>## description</span>
          {!editingDesc && (
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
              className="block w-full resize-y border border-line bg-bg px-2 py-1 outline-none focus:border-accent"
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
          <p className="text-muted">// описания нет</p>
        )}
      </section>

      <Subtasks taskId={task.id} boardId={boardId} />

      <Comments taskId={task.id} userId={user.id} />
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
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="w-full max-w-3xl border border-accent bg-elev p-5 shadow-2xl">
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={close} className="btn btn-danger">
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
          />
        )}
      </div>
    </div>
  );
}
