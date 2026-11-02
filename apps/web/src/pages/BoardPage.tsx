import { Link, Outlet, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useBoard } from '../api/boards';
import { ROUTES } from '../consts/routes';
import { BoardView } from '../features/board/BoardView';

export function BoardPage() {
  const id = Number(useParams().boardId);
  const { data, error, isLoading } = useBoard(id);

  if (isLoading) return <p className="p-4 text-muted">loading...</p>;
  if (error || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return <p className="p-4 text-danger">! {notFound ? 'board not found' : 'failed to load board'}</p>;
  }
  return (
    <div>
      <div className="px-4 pt-3">
        <Link to={ROUTES.HOME} className="text-muted hover:text-accent">
          ← boards
        </Link>
        <span className="ml-3"># {data.board.name}</span>
      </div>
      <BoardView data={data} />
      <Outlet />
    </div>
  );
}
