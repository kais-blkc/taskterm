import { useState } from 'react';
import type { Comment } from '@taskterm/shared';
import { LockHint } from '../../components/Icon';
import { useCommentMutations, useComments } from '../../api/tasks';
import { useUsers } from '../../api/users';
import { Markdown } from '../../components/Markdown';
import { UserTag } from '../../components/UserTag';
import { formatDateTime } from '../../lib/dates';
import { confirmDialog } from '../../stores/confirm';

function CommentForm({
  initial = '',
  submitLabel,
  onSubmit,
  onCancel,
  pending,
}: {
  initial?: string;
  submitLabel: string;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
  pending?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const send = () => {
    if (value.trim() && !pending) {
      onSubmit(value.trim());
      if (!onCancel) setValue('');
    }
  };
  return (
    <div className="comment-form space-y-2">
      <textarea
        value={value}
        rows={3}
        placeholder="comment (markdown), ctrl+enter — отправить"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
          if (e.key === 'Escape') onCancel?.();
        }}
        className="block w-full resize-y border border-line bg-bg px-2 py-1 outline-none focus:border-accent"
      />
      <div className="flex gap-2">
        <button type="button" onClick={send} disabled={pending} className="btn btn-primary">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn">
            cancel
          </button>
        )}
      </div>
    </div>
  );
}

function CommentItem({
  c,
  canEdit,
  canDelete,
  taskId,
}: {
  c: Comment;
  canEdit: boolean;
  canDelete: boolean;
  taskId: number;
}) {
  const m = useCommentMutations(taskId);
  const [editing, setEditing] = useState(false);
  const author = useUsers().byId.get(c.authorId);
  return (
    <li className="comment border border-line bg-bg p-2" style={author ? { borderLeft: `3px solid ${author.color}` } : undefined}>
      <div className="mb-1 flex items-center justify-between text-muted">
        <span>
          <UserTag user={author} fallback={c.authorName} /> · {formatDateTime(c.createdAt)}
          {c.editedAt && ' · (изм.)'}
        </span>
        {(canEdit || canDelete) && !editing && (
          <span className="flex gap-2">
            {canEdit && (
              <button type="button" onClick={() => setEditing(true)} className="btn">
                edit
              </button>
            )}
            {canDelete && <button
              type="button"
              onClick={async () => {
                if (await confirmDialog({ title: 'Удалить комментарий?', message: 'Это действие нельзя отменить.', danger: true })) {
                  m.remove.mutate(c.id);
                }
              }}
              className="btn btn-danger"
            >
              delete
            </button>}
          </span>
        )}
      </div>
      {editing ? (
        <CommentForm
          initial={c.body}
          submitLabel="save"
          pending={m.edit.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(body) => m.edit.mutate({ id: c.id, body }, { onSuccess: () => setEditing(false) })}
        />
      ) : (
        <Markdown>{c.body}</Markdown>
      )}
    </li>
  );
}

export function Comments({
  taskId,
  userId,
  canComment,
  commentsLocked = false,
  canModerate,
}: {
  taskId: number;
  userId: number;
  /** писать комментарии, править и удалять свои */
  canComment: boolean;
  /** owner задачи закрыл комментарии для остальных */
  commentsLocked?: boolean;
  /** удалять чужие (владелец доски) */
  canModerate: boolean;
}) {
  const { data, isLoading, error } = useComments(taskId);
  const m = useCommentMutations(taskId);
  return (
    <section className="comments space-y-3">
      <h3>
        ## comments {data && <span className="text-muted">({data.length})</span>}
        {commentsLocked && <LockHint className="ml-2" text="owner задачи закрыл новые комментарии" />}
      </h3>
      {isLoading && <p className="text-muted">loading...</p>}
      {error && <p className="text-danger">! failed to load comments</p>}
      <ul className="comments-list space-y-2">
        {data?.map((c) => (
          <CommentItem
            key={c.id}
            c={c}
            taskId={taskId}
            canEdit={canComment && c.authorId === userId}
            canDelete={(canComment && c.authorId === userId) || canModerate}
          />
        ))}
      </ul>
      {m.add.error && <p className="text-danger">! {m.add.error.message}</p>}
      {canComment ? (
        <CommentForm submitLabel="send" pending={m.add.isPending} onSubmit={(body) => m.add.mutate(body)} />
      ) : (
        !commentsLocked && <p className="text-muted">// у тебя роль «наблюдатель» — комментировать нельзя</p>
      )}
    </section>
  );
}
