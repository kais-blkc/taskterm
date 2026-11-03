import { useState } from 'react';
import { useAdminBoards } from '../../api/admin';
import { MembersDialog } from '../../components/MembersDialog';
import { formatDateTime } from '../../lib/dates';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../consts/routes';

/** Все доски приложения. Участников и роли (в т.ч. передачу владения) меняет админ как владелец любой доски. */
export function BoardsPanel({ meId }: { meId: number }) {
  const boards = useAdminBoards();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="admin-boards-panel space-y-2">
      <h2>## доски {boards.data && <span className="text-muted">({boards.data.length})</span>}</h2>
      {boards.isLoading && <p className="text-muted">loading...</p>}
      {boards.data?.length === 0 && <p className="text-muted text-[14px]">// досок пока нет</p>}
      <ul className="admin-boards-list space-y-1">
        {boards.data?.map((b) => (
          <li key={b.id} className="admin-board flex flex-wrap items-center justify-between gap-2 border border-line bg-bg px-3 py-2">
            <div className="min-w-0 space-y-0.5">
              <Link to={ROUTES.BOARD(b.id)} className="hover:text-accent">
                {b.name}
              </Link>
              <div className="text-xs text-muted">
                владельцы: {b.owners.length ? b.owners.map((o) => `@${o}`).join(', ') : '—'} · участников: {b.membersCount} · задач: {b.tasksCount} · создана {formatDateTime(b.createdAt)}
              </div>
            </div>
            <button type="button" className="btn" onClick={() => setOpen(b.id)}>
              участники и владелец
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <MembersDialog boardId={open} meId={meId} canManage onClose={() => setOpen(null)} />}
    </section>
  );
}
