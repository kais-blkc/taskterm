import { useEffect, useRef, useState } from 'react';
import { canManageUser, canSetRateOf, isAdminRole, type AdminUser, type GlobalRole, type Me } from '@taskterm/shared';
import { resetLink, useAdminUserMutations, useAdminUsers } from '../../api/admin';
import { useTimeSettings } from '../../api/time';
import { Select } from '../../components/Select';
import { ColorDot } from '../../components/UserTag';
import { formatDateTime } from '../../lib/dates';
import { confirmDialog } from '../../stores/confirm';
import { OneTimeLink } from './OneTimeLink';

const ROLE_NAMES: Record<GlobalRole, string> = { owner: 'владелец', admin: 'администратор', moderator: 'модератор', member: 'участник' };
const roleOptions = (['member', 'moderator', 'admin'] as const).map((v) => ({ value: v, label: ROLE_NAMES[v] }));

/** Ставка сотрудника: видна, только если сервер её отдал; менять — owner/admin по правилам canSetRateOf */
function RateField({ user, editable, currency, pending, onSave }: {
  user: AdminUser;
  editable: boolean;
  currency: string;
  pending: boolean;
  onSave: (rate: number) => void;
}) {
  const [val, setVal] = useState<string | null>(null);
  if (user.hourlyRate === null) return null;
  if (!editable) return <span className="user-rate text-muted">{user.hourlyRate} {currency}/ч</span>;
  const text = val ?? String(user.hourlyRate);
  const num = Number(text.replace(',', '.'));
  const valid = text.trim() !== '' && Number.isFinite(num) && num >= 0;
  return (
    <span className="user-rate flex items-center gap-1">
      <input
        value={text}
        name="hourly-rate"
        autoComplete="off"
        inputMode="decimal"
        aria-label={`ставка @${user.username} за час`}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && valid && num !== user.hourlyRate && onSave(num)}
        className="user-rate-input w-20 border border-line bg-bg px-2 py-0.5 outline-none focus:border-accent"
      />
      <span className="user-rate-currency text-muted">{currency}/ч</span>
      {valid && num !== user.hourlyRate && (
        <button type="button" className="user-rate-save btn btn-primary" disabled={pending} onClick={() => onSave(num)}>
          сохранить
        </button>
      )}
    </span>
  );
}

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
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus(); // фокус внутрь окна при открытии
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay delete-user-overlay fixed inset-0 z-30 flex items-start justify-center bg-black/60 p-2 pt-4 sm:p-4 sm:pt-24" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-user-title"
        tabIndex={-1}
        className="modal-dialog delete-user-dialog w-full max-w-md space-y-3 border border-danger bg-elev p-4 outline-none"
      >
        <h2 id="delete-user-title">Удалить @{user.username}?</h2>
        <p className="delete-user-hint text-muted">
          Его доски, задачи, комментарии и приглашения перейдут выбранному пользователю, а в задачах он перестанет быть ответственным.
          Действие необратимо. Если нужно просто закрыть доступ — лучше заблокировать.
        </p>
        <Select
          value={heir}
          placeholder="кому передать данные…"
          options={heirs.map((u) => ({ value: String(u.id), label: `@${u.username}`, icon: <ColorDot color={u.color} /> }))}
          onChange={setHeir}
        />
        {error && <p role="alert" className="delete-user-error text-danger">! {error}</p>}
        <div className="delete-user-actions flex gap-2">
          <button type="button" className="delete-user-confirm btn btn-danger" disabled={!heir || pending} onClick={() => onSubmit(Number(heir))}>
            удалить
          </button>
          <button type="button" className="delete-user-cancel btn" onClick={onClose}>
            отмена
          </button>
        </div>
      </div>
    </div>
  );
}

export function UsersPanel({ me }: { me: Me }) {
  const meId = me.id;
  const currency = useTimeSettings().data?.currency ?? '$';
  const users = useAdminUsers();
  const m = useAdminUserMutations();
  const [link, setLink] = useState<{ username: string; token: string } | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const error = m.update.error ?? m.reset.error ?? m.setRate.error;

  return (
    <section className="users-panel space-y-3">
      <h2 className="users-title">## пользователи {users.data && <span className="users-count text-muted">({users.data.length})</span>}</h2>
      {users.isLoading && <p className="users-loading text-muted">Загрузка…</p>}
      {error && <p role="alert" className="users-error text-danger">! {error.message}</p>}
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
          const manage = canManageUser(me, u);
          return (
            <li key={u.id} className="user-row flex flex-wrap items-center justify-between gap-3 border border-line bg-bg px-3 py-2">
              <div className="user-info min-w-0 space-y-0.5">
                <div className="user-name-row flex items-center gap-2">
                  <ColorDot color={u.color} />
                  <span className={`user-name ${u.isActive ? '' : 'text-muted line-through'}`}>@{u.username}</span>
                  {self && <span className="user-self-mark text-xs text-muted">(это ты)</span>}
                  {!u.isActive && <span className="user-blocked-mark text-xs text-danger">[заблокирован]</span>}
                </div>
                <div className="user-meta text-xs text-muted">
                  {u.email ?? 'без email'} · досок: {u.boardsCount} · вход: {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'ещё не входил'}
                </div>
              </div>
              <div className="user-actions flex flex-wrap items-center gap-2">
                <RateField user={u} editable={canSetRateOf(me, u)} currency={currency} pending={m.setRate.isPending} onSave={(hourlyRate) => m.setRate.mutate({ id: u.id, hourlyRate })} />
                {isAdminRole(me.role) && u.role !== 'owner' ? (
                <Select
                  className="user-role-select w-44"
                  value={u.role}
                  options={roleOptions}
                  disabled={m.update.isPending}
                  onChange={async (v) => {
                    if (v === u.role) return;
                    const ok = await confirmDialog({
                      title: `Сделать @${u.username}: ${ROLE_NAMES[v as GlobalRole]}?`,
                      message: 'Его текущие сессии закроются, ему придётся войти заново.',
                      danger: v === 'member' && u.role !== 'moderator',
                    });
                    if (ok) m.update.mutate({ id: u.id, role: v as GlobalRole });
                  }}
                />
                ) : (
                  <span className="user-role text-muted">{ROLE_NAMES[u.role]}</span>
                )}
                {manage && u.isActive && (
                  <button
                    type="button"
                    className="user-reset-password btn"
                    disabled={m.reset.isPending}
                    onClick={() => m.reset.mutate(u.id, { onSuccess: (r) => setLink({ username: u.username, token: r.token }) })}
                  >
                    сброс пароля
                  </button>
                )}
                {manage && !self && (
                  <button
                    type="button"
                    className={`${u.isActive ? 'user-block' : 'user-unblock'} ${u.isActive ? 'btn btn-danger' : 'btn'}`}
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
                {manage && !self && isAdminRole(me.role) && (
                  <button type="button" className="user-delete btn btn-danger" onClick={() => (m.remove.reset(), setDeleting(u))}>
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
