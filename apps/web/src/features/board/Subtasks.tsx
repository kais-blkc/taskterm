import { useMemo, useState } from 'react';
import {
  CHECKLIST_MAX_ITEMS,
  SUBTASK_MODE_LABELS,
  canAddSubtask,
  canChangeSubtask,
  canDeleteSubtask,
  canEditTask,
  isPolicyExempt,
  parseChecklist,
  type Subtask,
  type Task,
  type TaskActor,
} from '@taskterm/shared';
import { Icon, LockHint } from '../../components/Icon';
import { useMembers } from '../../api/boards';
import { useSubtaskMutations, useSubtasks } from '../../api/subtasks';
import { useUsers } from '../../api/users';
import { Select, type SelectOption } from '../../components/Select';
import { ColorDot, UserTag } from '../../components/UserTag';

const NONE = '__none';

function Progress({ done, total }: { done: number; total: number }) {
  const cells = 10;
  const filled = total ? Math.round((done / total) * cells) : 0;
  return (
    <span className="subtasks-progress text-muted" title={`${done} из ${total}`}>
      <span className={done === total && total > 0 ? 'text-accent' : ''}>{'█'.repeat(filled)}</span>
      {'░'.repeat(cells - filled)} {done}/{total}
    </span>
  );
}

function SubtaskRow({
  s,
  index,
  canToggle,
  canChange,
  canDelete,
  assigneeOptions,
  onToggle,
  onRename,
  onAssign,
  onRemove,
}: {
  s: Subtask;
  /** порядковый номер, с 1 */
  index: number;
  canToggle: boolean;
  canChange: boolean;
  canDelete: boolean;
  /** кого можно назначить; undefined — назначать нельзя (покажем только текущего исполнителя) */
  assigneeOptions?: SelectOption[];
  onToggle: () => void;
  onRename: (title: string) => void;
  onAssign: (userId: number | null) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const users = useUsers();
  return (
    <li className="subtask group flex items-start gap-2 border border-transparent px-1 py-1.5 hover:border-line">
      <span className="subtask-number w-6 shrink-0 select-none text-right tabular-nums text-muted">{index}.</span>
      <button
        type="button"
        role="checkbox"
        aria-checked={s.done}
        aria-label={s.done ? 'снять отметку' : 'отметить выполненной'}
        disabled={!canToggle}
        onClick={onToggle}
        className={`mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center border text-xs leading-none ${
          s.done ? 'border-accent bg-accent text-bg' : 'border-fg-muted hover:border-accent'} ${canToggle ? '' : 'cursor-default'}
        }`}
      >
        {s.done && <Icon name="check" className="h-3 w-3" />}
      </button>
      {editing ? (
        <textarea
          autoFocus
          rows={1}
          defaultValue={s.title}
          ref={(el) => {
            // высота по тексту: при открытии и при вводе (см. onInput)
            if (el) {
              el.style.height = 'auto';
              el.style.height = `${el.scrollHeight}px`;
              if (!el.dataset.focused) {
                el.dataset.focused = '1';
                el.setSelectionRange(el.value.length, el.value.length);
              }
            }
          }}
          onInput={(e) => {
            e.currentTarget.style.height = 'auto';
            e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
          }}
          className="subtask-rename-input flex-1 resize-none border border-accent bg-bg px-1 outline-none"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== s.title) onRename(v);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            // enter — сохранить, shift+enter — новая строка
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === 'Escape') setEditing(false);
            e.stopPropagation();
          }}
        />
      ) : (
        <span
          className={`flex-1 whitespace-pre-wrap break-words ${canChange ? 'cursor-text' : ''} ${s.done ? 'text-muted line-through' : ''}`}
          title={canChange ? 'клик — переименовать' : undefined}
          onClick={() => canChange && setEditing(true)}
        >
          {s.title}
        </span>
      )}
      {assigneeOptions ? (
        <Select
          className="subtask-assignee-select w-40 shrink-0"
          value={s.assigneeId != null ? String(s.assigneeId) : ''}
          placeholder="+ исполнитель"
          options={s.assigneeId != null ? [{ value: NONE, label: '— снять —' }, ...assigneeOptions] : assigneeOptions}
          onChange={(v) => onAssign(v === NONE ? null : Number(v))}
        />
      ) : (
        s.assigneeId != null && (
          <span className="subtask-assignee shrink-0 border border-line px-1.5 text-[14px]">
            <UserTag user={users.byId.get(s.assigneeId)} />
          </span>
        )
      )}
      {canDelete && <button
        type="button"
        title="удалить подзадачу"
        onClick={onRemove}
        className="subtask-delete btn btn-danger btn-icon invisible group-focus-within:visible group-hover:visible [@media(hover:none)]:visible"
      >
        ×
      </button>}
    </li>
  );
}

export function Subtasks({ task, boardId, actor, userId }: { task: Task; boardId: number; actor: TaskActor; userId: number }) {
  const taskId = task.id;
  const canEditHere = canEditTask(actor);
  const canAdd = canAddSubtask(task.policy, actor);
  const restricted = canEditHere && !isPolicyExempt(actor) && task.policy.subtasks !== 'free';
  const { data, isLoading, error } = useSubtasks(taskId);
  const m = useSubtaskMutations(taskId, boardId);
  const members = useMembers(boardId);
  const [title, setTitle] = useState('');
  const [listMode, setListMode] = useState(false);
  const [text, setText] = useState('');

  // назначить можно любого участника доски; ответственные задачи — первыми, остальные станут ответственными после назначения
  const assigneeOptions: SelectOption[] = [...(members.data ?? [])]
    .sort((a, b) => Number(task.assigneeIds.includes(b.id)) - Number(task.assigneeIds.includes(a.id)))
    .map((u) => ({
      value: String(u.id),
      label: `@${u.username}${u.id === userId ? ' (я)' : ''}${task.assigneeIds.includes(u.id) ? '' : ' (+ в задачу)'}`,
      icon: <ColorDot color={u.color} />,
    }));
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
    <section className="subtasks mt-8 space-y-2">
      <h3 className="flex flex-wrap items-center justify-between gap-2">
        <span>
          ## подзадачи
          {restricted && (
            <LockHint
              className="ml-2"
              text={`режим подзадач: ${SUBTASK_MODE_LABELS[task.policy.subtasks]}. Менять можно только свои пункты (созданные тобой или назначенные тебе)`}
            />
          )}
        </span>
        {total > 0 && <Progress done={done} total={total} />}
      </h3>
      {isLoading && <p className="text-muted">Загрузка…</p>}
      {error && <p className="text-danger">! не удалось загрузить подзадачи</p>}
      {data && data.length === 0 && <p className="text-muted text-[14px]">// подзадач нет</p>}
      <ul className="subtasks-list space-y-1.5">
        {data?.map((s, i) => (
          <SubtaskRow
            key={s.id}
            s={s}
            index={i + 1}
            canToggle={canChangeSubtask(task.policy, actor, s, userId)}
            canChange={canChangeSubtask(task.policy, actor, s, userId)}
            canDelete={canDeleteSubtask(task.policy, actor, s, userId)}
            assigneeOptions={canChangeSubtask(task.policy, actor, s, userId) ? assigneeOptions : undefined}
            onAssign={(assigneeId) => m.update.mutate({ id: s.id, assigneeId })}
            onToggle={() => m.update.mutate({ id: s.id, done: !s.done })}
            onRename={(t) => m.update.mutate({ id: s.id, title: t })}
            onRemove={() => m.remove.mutate(s.id)}
          />
        ))}
      </ul>
      {m.addMany.error && <p className="text-danger">! {m.addMany.error.message}</p>}

      {!canAdd ? null : listMode ? (
        <div className="subtasks-bulk-form space-y-2">
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
              добавить {parsed.length || ''}
            </button>
            <button type="button" className="btn" onClick={() => setListMode(false)}>
              отмена
            </button>
            <span className="text-muted text-[14px]">
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
          className="flex flex-wrap gap-2"
        >
          <input
            value={title}
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
            className="subtask-add-input min-w-0 flex-1 basis-full border border-line bg-bg px-2 py-1 outline-none focus:border-accent sm:basis-0"
          />
          <button type="submit" disabled={!title.trim()} className="btn">
            добавить
          </button>
          <button type="button" className="btn" title="вставить список текстом" onClick={() => setListMode(true)}>
            списком
          </button>
        </form>
      )}
    </section>
  );
}
