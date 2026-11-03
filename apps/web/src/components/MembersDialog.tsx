import { useEffect, useRef } from 'react';
import { useState } from 'react';
import { BOARD_ROLES, ROLE_LABELS, type BoardRole } from '@taskterm/shared';
import { useMemberMutations, useMembers } from '../api/boards';
import { useUsers } from '../api/users';
import { confirmDialog } from '../stores/confirm';
import { Select } from './Select';
import { ColorDot, UserTag } from './UserTag';

const ROLE_HINT: Record<BoardRole, string> = {
  owner: 'всё: участники, колонки, удаление доски и любых задач',
  editor: 'создаёт и правит задачи, подзадачи; удаляет только свои',
  commenter: 'читает и комментирует',
  viewer: 'только читает',
};
const roleOptions = BOARD_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

/** Участники доски и их роли. Менять может владелец (и админ); остальные видят список и могут выйти. */
export function MembersDialog({
  boardId,
  meId,
  canManage,
  onClose,
}: {
  boardId: number;
  meId: number;
  canManage: boolean;
  onClose: () => void;
}) {
  const members = useMembers(boardId);
  const users = useUsers();
  const m = useMemberMutations(boardId);
  const box = useRef<HTMLDivElement>(null);
  const [newUser, setNewUser] = useState('');
  const [newRole, setNewRole] = useState<BoardRole>('editor');

  // закрываем по клику вне окна и по Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const memberIds = new Set((members.data ?? []).map((x) => x.id));
  const candidates = (users.data ?? []).filter((u) => !memberIds.has(u.id));
  const error = m.setRole.error ?? m.remove.error;

  return (
    <div
      className="members-overlay fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/60 p-2 pt-4 sm:p-4 sm:pt-16"
      onMouseDown={(e) => !box.current?.contains(e.target as Node) && onClose()}
    >
      <div ref={box} className="members-dialog w-full max-w-xl space-y-4 border border-accent bg-elev p-3 sm:p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2>## members</h2>
          <button type="button" className="btn btn-danger" onClick={onClose}>
            close <span className="text-muted">esc</span>
          </button>
        </div>

        {members.isLoading && <p className="text-muted">loading...</p>}
        <ul className="members-list space-y-1">
          {members.data?.map((u) => (
            <li key={u.id} className="members-item flex flex-wrap items-center justify-between gap-2 border border-line bg-bg px-2 py-1.5">
              <UserTag user={u} />
              <span className="flex items-center gap-2">
                {canManage ? (
                  <Select
                    className="w-40"
                    value={u.role}
                    options={roleOptions}
                    disabled={m.setRole.isPending}
                    onChange={(role) => m.setRole.mutate({ userId: u.id, role: role as BoardRole })}
                  />
                ) : (
                  <span title={ROLE_HINT[u.role]}>{ROLE_LABELS[u.role]}</span>
                )}
                {(canManage || u.id === meId) && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    title={u.id === meId ? 'выйти с доски' : 'убрать с доски'}
                    onClick={async () => {
                      const self = u.id === meId;
                      const ok = await confirmDialog({
                        title: self ? 'Выйти с доски?' : `Убрать @${u.username} с доски?`,
                        message: self
                          ? 'Доступ к доске пропадёт, вернуть его сможет только владелец.'
                          : 'Он потеряет доступ к доске, а с его задач снимется назначение.',
                        danger: true,
                      });
                      if (ok) m.remove.mutate(u.id);
                    }}
                  >
                    {u.id === meId ? 'выйти' : '×'}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {error && <p className="text-danger">! {error.message}</p>}

        {canManage && (
          <div className="members-add space-y-2 border-t border-line pt-3">
            <div className="text-muted">+ добавить участника</div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                className="w-48"
                value={newUser}
                placeholder={candidates.length ? '@user…' : 'все уже на доске'}
                disabled={!candidates.length}
                options={candidates.map((u) => ({ value: String(u.id), label: `@${u.username}`, icon: <ColorDot color={u.color} /> }))}
                onChange={setNewUser}
              />
              <Select className="w-40" value={newRole} options={roleOptions} onChange={(r) => setNewRole(r as BoardRole)} />
              <button
                type="button"
                className="btn btn-primary"
                disabled={!newUser || m.setRole.isPending}
                onClick={() => m.setRole.mutate({ userId: Number(newUser), role: newRole }, { onSuccess: () => setNewUser('') })}
              >
                add
              </button>
            </div>
            <p className="text-[14px] text-muted">{ROLE_HINT[newRole]}</p>
          </div>
        )}

        <dl className="members-roles-legend space-y-0.5 border-t border-line pt-3 text-[14px] text-muted">
          {BOARD_ROLES.map((r) => (
            <div key={r} className="flex gap-2">
              <dt className="w-28 shrink-0 text-fg">{ROLE_LABELS[r]}</dt>
              <dd>{ROLE_HINT[r]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
