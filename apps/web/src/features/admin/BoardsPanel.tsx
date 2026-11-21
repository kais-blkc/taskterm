import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminBoardMutations, useAdminBoards } from '../../api/admin';
import { Icon, LockHint } from '../../components/Icon';
import { MembersDialog } from '../../components/MembersDialog';
import { ROUTES } from '../../consts/routes';
import { formatDateTime } from '../../lib/dates';
import { confirmDialog } from '../../stores/confirm';
import { NotifySettings } from './NotifySettings';

/**
 * Все доски приложения. Админ создаёт доски (они сразу защищены: названием, колонками, участниками и удалением
 * управляют только админы), включает/снимает защиту и меняет участников и владельцев.
 */
export function BoardsPanel({ meId, focusBoardId }: { meId: number; focusBoardId?: number }) {
  const boards = useAdminBoards();
  const m = useAdminBoardMutations();
  const [open, setOpen] = useState<number | null>(null);
  const [name, setName] = useState('');
  const error = m.create.error ?? m.setManaged.error ?? m.remove.error;

  // пришли из доски («изменить»): подсвечиваем её строку и прокручиваем к ней
  useEffect(() => {
    if (focusBoardId && boards.data) document.querySelector(`[data-board-id="${focusBoardId}"]`)?.scrollIntoView({ block: 'center' });
  }, [focusBoardId, boards.data]);

  const create = () => {
    const v = name.trim();
    if (v) m.create.mutate(v, { onSuccess: () => setName('') });
  };

  return (
    <section className="admin-boards-panel space-y-3">
      <NotifySettings />

      <div className="admin-board-create space-y-2 border border-line bg-elev p-4">
        <h2>## новая доска</h2>
        <div className="admin-board-create-row flex flex-wrap items-center gap-2">
          <input
            value={name}
            name="board-name"
            autoComplete="off"
            aria-label="название доски"
            maxLength={100}
            placeholder="название доски"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            className="admin-board-name-input min-w-0 flex-1 border border-line bg-bg px-2 py-1 outline-none focus:border-accent"
          />
          <button type="button" className="admin-board-create-submit btn btn-primary" disabled={!name.trim() || m.create.isPending} onClick={create}>
            создать
          </button>
        </div>
        <p className="admin-board-create-hint text-[14px] text-muted">// доска защищена: участники, даже владельцы, не могут её переименовать, удалить, менять колонки и состав. Участников добавьте кнопкой «участники и владелец».</p>
      </div>

      <h2 className="admin-boards-title mt-8">## доски {boards.data && <span className="admin-boards-count text-muted">({boards.data.length})</span>}</h2>
      {error && <p role="alert" className="admin-boards-error text-danger">! {error.message}</p>}
      {boards.isLoading && <p className="admin-boards-loading text-muted">Загрузка…</p>}
      {boards.data?.length === 0 && <p className="admin-boards-empty text-muted text-[14px]">// досок пока нет</p>}
      <ul className="admin-boards-list space-y-1">
        {boards.data?.map((b) => (
          <li
            key={b.id}
            data-board-id={b.id}
            className={`admin-board flex flex-wrap items-center justify-between gap-2 border bg-bg px-3 py-2 ${b.id === focusBoardId ? 'border-accent' : 'border-line'}`}
          >
            <div className="admin-board-info min-w-0 space-y-0.5">
              <Link to={ROUTES.BOARD(b.id)} className="admin-board-link hover:text-accent">
                {b.name}
              </Link>
              {b.managedByAdmin && <LockHint className="admin-board-lock ml-2" text="Защищена: управлять могут только админы" />}
              <div className="admin-board-meta text-xs text-muted">
                владельцы: {b.owners.length ? b.owners.map((o) => `@${o}`).join(', ') : '—'} · участников: {b.membersCount} · задач: {b.tasksCount} · создана {formatDateTime(b.createdAt)}
              </div>
            </div>
            <div className="admin-board-actions flex flex-wrap gap-2">
              <button type="button" className="admin-board-members btn px-3 py-1" title="участники и владелец" aria-label="участники и владелец" onClick={() => setOpen(b.id)}>
                <Icon name="users" className="text-[1.25em]" />
              </button>
              <button
                type="button"
                aria-pressed={b.managedByAdmin}
                className={`admin-board-protect btn ${b.managedByAdmin ? 'btn-active' : ''}`}
                disabled={m.setManaged.isPending}
                title={b.managedByAdmin ? 'снять защиту: владельцы доски смогут ею управлять' : 'защитить: управлять смогут только админы'}
                onClick={() => m.setManaged.mutate({ id: b.id, managedByAdmin: !b.managedByAdmin })}
              >
                {b.managedByAdmin ? 'защищена' : 'не защищена'}
              </button>
              <button
                type="button"
                className="admin-board-delete btn btn-danger"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: `Удалить доску «${b.name}»?`,
                    message: `Вместе с доской удалятся все её колонки, задачи (${b.tasksCount}) и комментарии.`,
                    danger: true,
                  });
                  if (ok) m.remove.mutate(b.id);
                }}
              >
                удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
      {open !== null && <MembersDialog boardId={open} meId={meId} canManage onClose={() => setOpen(null)} />}
    </section>
  );
}
