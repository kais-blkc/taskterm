import { useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { ROLE_LABELS, isStaffRole } from '@taskterm/shared';
import { useMe } from '../api/auth';
import { Icon, LockHint } from '../components/Icon';
import { MembersDialog } from '../components/MembersDialog';
import { ApiError } from '../api/client';
import { useBoard } from '../api/boards';
import { ROUTES } from '../consts/routes';
import { BoardView } from '../features/board/BoardView';

export function BoardPage() {
  const id = Number(useParams().boardId);
  const { data, error, isLoading } = useBoard(id);
  const me = useMe().data;
  const [membersOpen, setMembersOpen] = useState(false);

  if (isLoading) return <p className="board-loading p-4 text-muted">Загрузка…</p>;
  if (error || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return <p className="board-error p-4 text-danger">! {notFound ? 'board not found' : 'failed to load board'}</p>;
  }
  return (
    <div className="board-page">
      <div className="board-header flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-line px-4 pb-3 pt-3 sm:border-0 sm:pb-0">
        <Link to={ROUTES.HOME} className="board-back-link text-muted hover:text-accent">
          ← доски
        </Link>
        {/* название рядом со ссылкой «назад», длинное обрезается */}
        <div className="board-title flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <span className="board-name min-w-0 truncate max-sm:ml-auto"># {data.board.name}</span>
          <span className="board-role shrink-0 text-muted" title="твоя роль на доске">
            [{ROLE_LABELS[data.board.myRole]}]
          </span>
        {data.board.managedByAdmin && (
          <LockHint className="board-protected" text={data.board.canManage ? 'Доска защищена: управлять ею могут только админы, а ты админ' : 'Доска защищена админом: название, колонки и участников меняют только админы'} />
        )}
        </div>
        {/* телефон: кнопки на своей строке, в ряд */}
        <div className="board-actions flex basis-full items-center justify-end gap-2 sm:basis-auto sm:justify-start sm:ml-1">
        <button type="button" className="board-members-button btn px-3 py-1" title="участники" aria-label="участники" onClick={() => setMembersOpen(true)}>
          <Icon name="users" className="text-[1.25em]" />
        </button>
        {me && isStaffRole(me.role) && (
          // админ/модератор: быстрый переход к этой доске в админке (название, защита, участники, удаление)
          <Link to={ROUTES.ADMIN_BOARD(id)} className="board-admin-link btn px-3 py-1" title="открыть эту доску в админке" aria-label="изменить">
            <Icon name="edit" className="text-[1.25em]" />
          </Link>
        )}
        </div>
      </div>
      {membersOpen && me && (
        <MembersDialog
          boardId={id}
          meId={me.id}
          canManage={data.board.canManage}
          onClose={() => setMembersOpen(false)}
        />
      )}
      <BoardView data={data} />
      <Outlet />
    </div>
  );
}
