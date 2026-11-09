import { useEffect, useState } from 'react';
import type { AdminUser, GlobalRole } from '@taskterm/shared';
import { resetLink, useAdminUserMutations, useAdminUsers } from '../../api/admin';
import { Select } from '../../components/Select';
import { ColorDot } from '../../components/UserTag';
import { formatDateTime } from '../../lib/dates';
import { confirmDialog } from '../../stores/confirm';
import { OneTimeLink } from './OneTimeLink';

const roleOptions = [
  { value: 'member', label: 'участник' },
  { value: 'admin', label: 'администратор' },
];

/** Удаление: данные пользователя (доски, задачи, комментарии) переходят выбранному получателю */
function DeleteDialog({ user, heirs, pending, error, onSubmit, onClose }: {
  user: AdminUser;
  heirs: AdminUser[];
  pending: boolean;
  error?: string;
  onSubmit: (heirId: number) => void;
  onClose: () => void;
}) {
  const [heir, setHeir] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay delete-user-overlay fixed inset-0 z-30 flex items-start justify-center bg-black/60 p-2 pt-4 sm:p-4 sm:pt-24" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog delete-user-dialog w-full max-w-md space-y-3 border border-danger bg-elev p-4">
        <h2>Удалить @{user.username}?</h2>
        <p className="text-muted">
          Его доски, задачи, комментарии и приглашения перейдут выбранному пользователю, а в задачах он перестанет быть ответственным.
          Действие необратимо. Если нужно просто закрыть доступ — лучше заблокировать.
        </p>
        <Select
          value={heir}
          placeholder="кому передать данные…"
          options={heirs.map((u) => ({ value: String(u.id), label: `@${u.username}`, icon: <ColorDot color={u.color} /> }))}
          onChange={setHeir}
        />
        {error && <p className="text-danger">! {error}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn btn-danger" disabled={!heir || pending} onClick={() => onSubmit(Number(heir))}>
            удалить
          </button>
          <button type="button" className="btn" onClick={onClose}>
            отмена
          </button>
        </div>
      </div>
    </div>
  );
}

export function UsersPanel({ meId }: { meId: number }) {
  const users = useAdminUsers();
  const m = useAdminUserMutations();
  const [link, setLink] = useState<{ username: string; token: string } | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const error = m.update.error ?? m.reset.error;

  return (
    <section className="users-panel space-y-3">
      <h2>## пользователи {users.data && <span className="text-muted">({users.data.length})</span>}</h2>
      {users.isLoading && <p className="text-muted">loading...</p>}
      {error && <p className="text-danger">! {error.message}</p>}
      {link && (
        <OneTimeLink
          title={`ссылка сброса пароля для @${link.username}`}
          hint="действует 24 часа, одноразовая; все сессии пользователя закроются после смены"
          link={resetLink(link.token)}
          onClose={() => setLink(null)}
        />
      )}
      <ul className="users-list space-y-1">
        {users.data?.map((u) => {
          const self = u.id === meId;
          return (
            <li key={u.id} className="user-row flex flex-wrap items-center justify-between gap-3 border border-line bg-bg px-3 py-2">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <ColorDot color={u.color} />
                  <span className={u.isActive ? '' : 'text-muted line-through'}>@{u.username}</span>
                  {self && <span className="text-xs text-muted">(это ты)</span>}
                  {!u.isActive && <span className="text-xs text-danger">[заблокирован]</span>}
                </div>
                <div className="text-xs text-muted">
                  {u.email ?? 'без email'} · досок: {u.boardsCount} · вход: {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'ещё не входил'}
                </div>
              </div>
              <div className="user-actions flex flex-wrap items-center gap-2">
                <Select
                  className="w-44"
                  value={u.role}
                  options={roleOptions}
                  disabled={m.update.isPending}
                  onChange={async (v) => {
                    if (v === u.role) return;
                    const ok = await confirmDialog({
                      title: `Сделать @${u.username}: ${v === 'admin' ? 'администратором' : 'участником'}?`,
                      message: 'Его текущие сессии закроются, ему придётся войти заново.',
                      danger: v === 'member',
                    });
                    if (ok) m.update.mutate({ id: u.id, role: v as GlobalRole });
                  }}
                />
                {u.isActive && (
                  <button
                    type="button"
                    className="btn"
                    disabled={m.reset.isPending}
                    onClick={() => m.reset.mutate(u.id, { onSuccess: (r) => setLink({ username: u.username, token: r.token }) })}
                  >
                    сброс пароля
                  </button>
                )}
                {!self && (
                  <button
                    type="button"
                    className={u.isActive ? 'btn btn-danger' : 'btn'}
                    disabled={m.update.isPending}
                    onClick={async () => {
                      if (u.isActive) {
                        const ok = await confirmDialog({
                          title: `Заблокировать @${u.username}?`,
                          message: 'Все его сессии закроются сразу, войти он не сможет. Данные сохранятся.',
                          confirmLabel: 'заблокировать',
                          danger: true,
                        });
                        if (!ok) return;
                      }
                      m.update.mutate({ id: u.id, isActive: !u.isActive });
                    }}
                  >
                    {u.isActive ? 'заблокировать' : 'разблокировать'}
                  </button>
                )}
                {!self && (
                  <button type="button" className="btn btn-danger" onClick={() => (m.remove.reset(), setDeleting(u))}>
                    удалить
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {deleting && (
        <DeleteDialog
          user={deleting}
          heirs={(users.data ?? []).filter((u) => u.id !== deleting.id && u.isActive)}
          pending={m.remove.isPending}
          error={m.remove.error?.message}
          onClose={() => setDeleting(null)}
          onSubmit={(transferTo) => m.remove.mutate({ id: deleting.id, transferTo }, { onSuccess: () => setDeleting(null) })}
        />
      )}
    </section>
  );
}
