import { useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { ROLE_LABELS } from '@taskterm/shared';
import { useMe } from '../api/auth';
import { LockHint } from '../components/Icon';
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

  if (isLoading) return <p className="board-loading p-4 text-muted">loading...</p>;
  if (error || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return <p className="board-error p-4 text-danger">! {notFound ? 'board not found' : 'failed to load board'}</p>;
  }
  return (
    <div className="board-page">
      <div className="board-header px-4 pt-3">
        <Link to={ROUTES.HOME} className="board-back-link text-muted hover:text-accent">
          ← boards
        </Link>
        <span className="board-name ml-3"># {data.board.name}</span>
        <span className="board-role ml-3 text-muted" title="твоя роль на доске">
          [{ROLE_LABELS[data.board.myRole]}]
        </span>
        {data.board.managedByAdmin && (
          <LockHint className="board-protected ml-2" text={data.board.canManage ? 'Доска защищена: управлять ею могут только админы, а ты админ' : 'Доска защищена админом: название, колонки и участников меняют только админы'} />
        )}
        <button type="button" className="board-members-button btn ml-3" onClick={() => setMembersOpen(true)}>
          участники
        </button>
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
