import { useState } from 'react';
import type { Comment } from '@taskterm/shared';
import { LockHint } from '../../components/Icon';
import { useCommentMutations, useComments } from '../../api/tasks';
import { useUsers } from '../../api/users';
import { Markdown } from '../../components/Markdown';
import { MessageForm } from '../../components/MessageForm';
import { UserTag } from '../../components/UserTag';
import { formatDateTime } from '../../lib/dates';
import { confirmDialog } from '../../stores/confirm';

const COMMENT_PLACEHOLDER = 'комментарий (markdown), ctrl+enter — отправить';

function CommentItem({
  c,
  canEdit,
  canDelete,
  taskId,
  onSent,
}: {
  onSent?: () => void;
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
                изменить
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
              удалить
            </button>}
          </span>
        )}
      </div>
      {editing ? (
        <MessageForm
          className="comment-form"
          placeholder={COMMENT_PLACEHOLDER}
          initial={c.body}
          submitLabel="сохранить"
          pending={m.edit.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(body) => m.edit.mutate({ id: c.id, body }, { onSuccess: () => { setEditing(false); onSent?.(); } })}
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
  onSent,
}: {
  taskId: number;
  userId: number;
  /** писать комментарии, править и удалять свои */
  canComment: boolean;
  /** владелец задачи закрыл комментарии для остальных */
  commentsLocked?: boolean;
  /** удалять чужие (владелец доски) */
  canModerate: boolean;
  /** после успешной отправки комментария (модалка задачи сворачивается) */
  onSent?: () => void;
}) {
  const { data, isLoading, error } = useComments(taskId);
  const m = useCommentMutations(taskId);
  return (
    <section className="comments mt-8 space-y-3">
      <h3>
        ## comments {data && <span className="text-muted">({data.length})</span>}
        {commentsLocked && <LockHint className="ml-2" text="владелец задачи закрыл новые комментарии" />}
      </h3>
      {isLoading && <p className="text-muted">Загрузка…</p>}
      {error && <p className="text-danger">! не удалось загрузить комментарии</p>}
      <ul className="comments-list space-y-2">
        {data?.map((c) => (
          <CommentItem
            key={c.id}
            c={c}
            taskId={taskId}
            onSent={onSent}
            canEdit={canComment && c.authorId === userId}
            canDelete={(canComment && c.authorId === userId) || canModerate}
          />
        ))}
      </ul>
      {m.add.error && <p className="text-danger">! {m.add.error.message}</p>}
      {canComment ? (
        <MessageForm className="comment-form" placeholder={COMMENT_PLACEHOLDER} submitLabel="отправить" pending={m.add.isPending} onSubmit={(body) => m.add.mutate(body, { onSuccess: onSent })} />
      ) : (
        !commentsLocked && <p className="text-muted text-[14px]">// у тебя роль «наблюдатель» — комментировать нельзя</p>
      )}
    </section>
  );
}
