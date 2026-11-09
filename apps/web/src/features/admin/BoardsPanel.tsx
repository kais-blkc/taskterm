import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminBoardMutations, useAdminBoards } from '../../api/admin';
import { LockHint } from '../../components/Icon';
import { MembersDialog } from '../../components/MembersDialog';
import { ROUTES } from '../../consts/routes';
import { formatDateTime } from '../../lib/dates';
import { confirmDialog } from '../../stores/confirm';

/**
 * Все доски приложения. Админ создаёт доски (они сразу защищены: названием, колонками, участниками и удалением
 * управляют только админы), включает/снимает защиту и меняет участников и владельцев.
 */
export function BoardsPanel({ meId }: { meId: number }) {
  const boards = useAdminBoards();
  const m = useAdminBoardMutations();
  const [open, setOpen] = useState<number | null>(null);
  const [name, setName] = useState('');
  const error = m.create.error ?? m.setManaged.error ?? m.remove.error;

  const create = () => {
    const v = name.trim();
    if (v) m.create.mutate(v, { onSuccess: () => setName('') });
  };

  return (
    <section className="admin-boards-panel space-y-3">
      <div className="admin-board-create space-y-2 border border-line bg-elev p-4">
        <h2>## новая доска</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            maxLength={100}
            placeholder="название доски"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            className="admin-board-name-input min-w-0 flex-1 border border-line bg-bg px-2 py-1 outline-none focus:border-accent"
          />
          <button type="button" className="btn btn-primary" disabled={!name.trim() || m.create.isPending} onClick={create}>
            создать
          </button>
        </div>
        <p className="text-[14px] text-muted">// доска защищена: участники, даже владельцы, не могут её переименовать, удалить, менять колонки и состав. Участников добавьте кнопкой «участники и владелец».</p>
      </div>

      <h2 className="mt-8">## доски {boards.data && <span className="text-muted">({boards.data.length})</span>}</h2>
      {error && <p className="text-danger">! {error.message}</p>}
      {boards.isLoading && <p className="text-muted">loading...</p>}
      {boards.data?.length === 0 && <p className="text-muted text-[14px]">// досок пока нет</p>}
      <ul className="admin-boards-list space-y-1">
        {boards.data?.map((b) => (
          <li key={b.id} className="admin-board flex flex-wrap items-center justify-between gap-2 border border-line bg-bg px-3 py-2">
            <div className="min-w-0 space-y-0.5">
              <Link to={ROUTES.BOARD(b.id)} className="hover:text-accent">
                {b.name}
              </Link>
              {b.managedByAdmin && <LockHint className="ml-2" text="Защищена: управлять могут только админы" />}
              <div className="text-xs text-muted">
                владельцы: {b.owners.length ? b.owners.map((o) => `@${o}`).join(', ') : '—'} · участников: {b.membersCount} · задач: {b.tasksCount} · создана {formatDateTime(b.createdAt)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => setOpen(b.id)}>
                участники и владелец
              </button>
              <button
                type="button"
                className={`btn ${b.managedByAdmin ? 'btn-active' : ''}`}
                disabled={m.setManaged.isPending}
                title={b.managedByAdmin ? 'снять защиту: владельцы доски смогут ею управлять' : 'защитить: управлять смогут только админы'}
                onClick={() => m.setManaged.mutate({ id: b.id, managedByAdmin: !b.managedByAdmin })}
              >
                {b.managedByAdmin ? 'защищена' : 'не защищена'}
              </button>
              <button
                type="button"
                className="btn btn-danger"
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
