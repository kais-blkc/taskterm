import { useState } from 'react';
import {
  SUBTASK_MODE_LABELS,
  isPolicyDefault,
  roleCan,
  subtaskModeSchema,
  DEFAULT_TASK_POLICY,
  type SubtaskMode,
  type Task,
  type TaskPolicy,
} from '@taskterm/shared';
import { useMembers } from '../../api/boards';
import { useSetPolicy, useTransferOwner } from '../../api/tasks';
import { ColorDot, UserTag } from '../../components/UserTag';
import { Select } from '../../components/Select';
import { useUsers } from '../../api/users';
import { confirmDialog } from '../../stores/confirm';

const LOCKS: { key: Exclude<keyof TaskPolicy, 'subtasks'>; label: string }[] = [
  { key: 'lockTitle', label: 'менять название' },
  { key: 'lockDescription', label: 'менять описание' },
  { key: 'lockAssignee', label: 'менять ответственного' },
  { key: 'lockDueDate', label: 'менять дедлайн' },
  { key: 'lockMove', label: 'переносить по колонкам' },
  { key: 'commentsLocked', label: 'писать комментарии' },
];

/** Секция «права» задачи: видна owner задачи, владельцу доски и админу */
export function TaskRights({ task, boardId }: { task: Task; boardId: number }) {
  const [open, setOpen] = useState(false);
  const setPolicy = useSetPolicy(boardId);
  const transfer = useTransferOwner(boardId);
  const members = useMembers(boardId);
  const users = useUsers();
  const p = task.policy;
  const apply = (patch: Partial<TaskPolicy>) => setPolicy.mutate({ id: task.id, policy: { ...p, ...patch } });
  const heirs = (members.data ?? []).filter((m) => m.id !== task.authorId && roleCan(m.role, 'editTask'));

  return (
    <section className="space-y-2">
      <h3 className="flex flex-wrap items-center justify-between gap-2">
        <span>
          ## rights{' '}
          {!isPolicyDefault(p) && <span className="text-muted">🔒 есть ограничения</span>}
        </span>
        <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
          {open ? 'свернуть' : 'настроить'}
        </button>
      </h3>
      {open && (
        <div className="space-y-3 border border-line bg-bg p-3">
          <div>
            <p className="mb-1 text-muted">// что могут делать редакторы доски (ты, владелец доски и админ — всегда всё):</p>
            <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {LOCKS.map(({ key, label }) => (
                <li key={key}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={!p[key]}
                    disabled={setPolicy.isPending}
                    onClick={() => apply({ [key]: !p[key] })}
                    className="flex items-center gap-2 hover:text-accent"
                  >
                    <span
                      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center border text-xs leading-none ${
                        !p[key] ? 'border-accent bg-accent text-bg' : 'border-fg-muted'
                      }`}
                    >
                      {!p[key] && '✓'}
                    </span>
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-[7rem_1fr] items-center gap-y-2">
            <span className="text-muted">подзадачи</span>
            <Select
              className="min-w-64"
              disabled={setPolicy.isPending}
              value={p.subtasks}
              options={subtaskModeSchema.options.map((m) => ({ value: m, label: SUBTASK_MODE_LABELS[m] }))}
              onChange={(v) => apply({ subtasks: v as SubtaskMode })}
            />
            <span className="text-muted">владелец</span>
            <div className="flex flex-wrap items-center gap-3">
              <UserTag user={users.byId.get(task.authorId)} />
              <Select
                className="min-w-56"
                disabled={transfer.isPending || heirs.length === 0}
                value=""
                placeholder="передать владение…"
                options={heirs.map((m) => ({ value: String(m.id), label: `@${m.username}`, icon: <ColorDot color={m.color} /> }))}
                onChange={async (v) => {
                  const to = heirs.find((m) => m.id === Number(v));
                  if (!to) return;
                  const ok = await confirmDialog({
                    title: 'Передать владение задачей?',
                    message: `@${to.username} станет owner задачи #${task.number}. Ты потеряешь право менять её права, если ты не владелец доски.`,
                    confirmLabel: 'передать',
                  });
                  if (ok) transfer.mutate({ id: task.id, userId: to.id });
                }}
              />
            </div>
          </div>
          {(setPolicy.error || transfer.error) && <p className="text-danger">! {(setPolicy.error ?? transfer.error)?.message}</p>}
          {!isPolicyDefault(p) && (
            <button type="button" className="btn" disabled={setPolicy.isPending} onClick={() => apply({ ...DEFAULT_TASK_POLICY })}>
              разрешить всё
            </button>
          )}
        </div>
      )}
    </section>
  );
}
