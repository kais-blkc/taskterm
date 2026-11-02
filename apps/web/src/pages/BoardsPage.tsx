import { Link } from 'react-router-dom';
import { ROUTES } from '../consts/routes';
import { useBoards, useCreateBoard, useDeleteBoard } from '../api/boards';
import { InlineAdd } from '../components/InlineAdd';
import { confirmDialog } from '../stores/confirm';

export function BoardsPage() {
  const boards = useBoards();
  const create = useCreateBoard();
  const del = useDeleteBoard();

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="mb-4">$ ls boards/</h1>
      {boards.isLoading && <p className="text-muted">loading...</p>}
      {boards.data?.length === 0 && <p className="text-muted">// пока нет досок — создай первую</p>}
      <ul className="mb-4 space-y-1">
        {boards.data?.map((b) => (
          <li key={b.id} className="flex items-center justify-between border border-line bg-elev px-3 py-2 hover:border-accent">
            <Link to={ROUTES.BOARD(b.id)} className="flex-1 hover:text-accent">
              <span className="text-muted">├── </span>
              {b.name}
            </Link>
            <button
              type="button"
              title="удалить доску"
              className="btn btn-danger btn-icon"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: `Удалить доску «${b.name}»?`,
                  message: 'Вместе с доской удалятся все её колонки, задачи и комментарии.',
                  danger: true,
                });
                if (ok) del.mutate(b.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <InlineAdd label="board" placeholder="board name, enter" onSubmit={(name) => create.mutate(name)} />
    </div>
  );
}
