import { useMemo, useState } from 'react';
import {
  CHECKLIST_MAX_ITEMS,
  SUBTASK_MODE_LABELS,
  canAddSubtask,
  canChangeSubtask,
  canDeleteSubtask,
  canCheckSubtask,
  isPolicyExempt,
  parseChecklist,
  type Subtask,
  type Task,
  type TaskActor,
} from '@taskterm/shared';
import { useSubtaskMutations, useSubtasks } from '../../api/subtasks';

function Progress({ done, total }: { done: number; total: number }) {
  const cells = 10;
  const filled = total ? Math.round((done / total) * cells) : 0;
  return (
    <span className="text-muted" title={`${done} из ${total}`}>
      <span className={done === total && total > 0 ? 'text-accent' : ''}>{'█'.repeat(filled)}</span>
      {'░'.repeat(cells - filled)} {done}/{total}
    </span>
  );
}

function SubtaskRow({
  s,
  canToggle,
  canChange,
  canDelete,
  onToggle,
  onRename,
  onRemove,
}: {
  s: Subtask;
  canToggle: boolean;
  canChange: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="group flex items-center gap-2 border border-transparent px-1 py-0.5 hover:border-line">
      <button
        type="button"
        role="checkbox"
        aria-checked={s.done}
        aria-label={s.done ? 'снять отметку' : 'отметить выполненной'}
        disabled={!canToggle}
        onClick={onToggle}
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center border text-xs leading-none ${
          s.done ? 'border-accent bg-accent text-bg' : 'border-fg-muted hover:border-accent'} ${canToggle ? '' : 'cursor-default'}
        }`}
      >
        {s.done && '✓'}
      </button>
      {editing ? (
        <input
          autoFocus
          defaultValue={s.title}
          className="flex-1 border border-accent bg-bg px-1 outline-none"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== s.title) onRename(v);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(false);
            e.stopPropagation();
          }}
        />
      ) : (
        <span
          className={`flex-1 break-words ${canChange ? 'cursor-text' : ''} ${s.done ? 'text-muted line-through' : ''}`}
          title={canChange ? 'клик — переименовать' : undefined}
          onClick={() => canChange && setEditing(true)}
        >
          {s.title}
        </span>
      )}
      {canDelete && <button
        type="button"
        title="удалить подзадачу"
        onClick={onRemove}
        className="btn btn-danger btn-icon invisible group-focus-within:visible group-hover:visible"
      >
        ×
      </button>}
    </li>
  );
}

export function Subtasks({ task, boardId, actor, userId }: { task: Task; boardId: number; actor: TaskActor; userId: number }) {
  const taskId = task.id;
  const canCheck = canCheckSubtask(actor);
  const canAdd = canAddSubtask(task.policy, actor);
  const restricted = canCheck && !isPolicyExempt(actor) && task.policy.subtasks !== 'free';
  const { data, isLoading, error } = useSubtasks(taskId);
  const m = useSubtaskMutations(taskId, boardId);
  const [title, setTitle] = useState('');
  const [listMode, setListMode] = useState(false);
  const [text, setText] = useState('');

  const done = data?.filter((s) => s.done).length ?? 0;
  const total = data?.length ?? 0;
  const parsed = useMemo(() => parseChecklist(text), [text]);
  const parsedDone = parsed.filter((i) => i.done).length;

  const submit = () => {
    // даже одна строка проходит через парсер: «- [x] пункт» → пункт с галочкой
    const items = parseChecklist(title);
    if (!items.length) return;
    m.addMany.mutate(items);
    setTitle(''); // поле остаётся в фокусе — можно вводить следующую подзадачу
  };

  const submitList = () => {
    if (!parsed.length) return;
    m.addMany.mutate(parsed, { onSuccess: () => (setText(''), setListMode(false)) });
  };

  return (
    <section className="space-y-2">
      <h3 className="flex flex-wrap items-center justify-between gap-2">
        <span>## subtasks</span>
        {total > 0 && <Progress done={done} total={total} />}
      </h3>
      {isLoading && <p className="text-muted">loading...</p>}
      {error && <p className="text-danger">! failed to load subtasks</p>}
      {data && data.length === 0 && <p className="text-muted">// подзадач нет</p>}
      <ul className="space-y-0.5">
        {data?.map((s) => (
          <SubtaskRow
            key={s.id}
            s={s}
            canToggle={canCheck}
            canChange={canChangeSubtask(task.policy, actor, s.createdBy, userId)}
            canDelete={canDeleteSubtask(task.policy, actor, s.createdBy, userId)}
            onToggle={() => m.update.mutate({ id: s.id, done: !s.done })}
            onRename={(t) => m.update.mutate({ id: s.id, title: t })}
            onRemove={() => m.remove.mutate(s.id)}
          />
        ))}
      </ul>
      {m.addMany.error && <p className="text-danger">! {m.addMany.error.message}</p>}

      {restricted && (
        <p className="text-muted">
          🔒 owner задачи ограничил подзадачи: {SUBTASK_MODE_LABELS[task.policy.subtasks]}; пункты owner задачи менять и удалять нельзя
        </p>
      )}

      {!canAdd ? null : listMode ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            rows={6}
            value={text}
            placeholder={'- пункт 1\n- пункт 2\n- [x] уже сделано\n1. можно и так'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitList();
              if (e.key === 'Escape') setListMode(false);
            }}
            className="block w-full resize-y border border-line bg-bg px-2 py-1 outline-none focus:border-accent"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary" disabled={!parsed.length || m.addMany.isPending} onClick={submitList}>
              add {parsed.length || ''}
            </button>
            <button type="button" className="btn" onClick={() => setListMode(false)}>
              cancel
            </button>
            <span className="text-muted">
              {parsed.length
                ? `распознано: ${parsed.length}${parsedDone ? `, отмечено: ${parsedDone}` : ''}`
                : '// по пункту на строку: «- », «* », «1. », «- [x] »'}
              {parsed.length >= CHECKLIST_MAX_ITEMS && ` (максимум ${CHECKLIST_MAX_ITEMS})`}
            </span>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex gap-2"
        >
          <input
            value={title}
            maxLength={500}
            placeholder="+ новая подзадача, enter (можно вставить целый список)"
            onChange={(e) => setTitle(e.target.value)}
            onPaste={(e) => {
              // вставили многострочный текст — превращаем в список сразу
              const pasted = e.clipboardData.getData('text');
              if (/\r?\n/.test(pasted.trim())) {
                const items = parseChecklist(pasted);
                if (items.length) {
                  e.preventDefault();
                  m.addMany.mutate(items);
                }
              }
            }}
            className="flex-1 border border-line bg-bg px-2 py-1 outline-none focus:border-accent"
          />
          <button type="submit" disabled={!title.trim()} className="btn">
            add
          </button>
          <button type="button" className="btn" title="вставить список текстом" onClick={() => setListMode(true)}>
            списком
          </button>
        </form>
      )}
    </section>
  );
}
