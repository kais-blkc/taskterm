import { Icon } from '../../components/Icon';
import { useState } from 'react';
import {
  BOARD_ROLES,
  ROLE_LABELS,
  type BoardGrant,
  type BoardRole,
  type GlobalRole,
  type Invite,
  type InviteCreated,
  type InviteStatus,
} from '@taskterm/shared';
import { useBoards } from '../../api/boards';
import { inviteLink, useInviteMutations, useInvites } from '../../api/invites';
import { Select } from '../../components/Select';
import { formatDateTime } from '../../lib/dates';
import { confirmDialog } from '../../stores/confirm';

const STATUS: Record<InviteStatus, { label: string; cls: string }> = {
  pending: { label: 'ожидает', cls: 'text-accent' },
  accepted: { label: 'принято', cls: 'text-muted' },
  expired: { label: 'истекло', cls: 'text-danger' },
  revoked: { label: 'отозвано', cls: 'text-muted line-through' },
};
const boardRoleOptions = BOARD_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
const ROLE_NAMES: Record<GlobalRole, string> = { owner: 'владелец', admin: 'администратор', moderator: 'модератор', member: 'участник' };
const globalRoleOptions = (['member', 'moderator', 'admin'] as const).map((v) => ({ value: v, label: ROLE_NAMES[v] }));

/** Ссылка показывается один раз: в БД хранится только хэш токена */
function LinkBox({ created, onClose }: { created: InviteCreated; onClose: () => void }) {
  const link = inviteLink(created.token);
  const [copied, setCopied] = useState(false);
  return (
    <div className="invite-link-box space-y-2 border border-accent bg-bg p-3">
      <div>
        ссылка для <span className="invite-link-email text-fg">{created.email}</span> <span className="invite-link-hint text-muted">(действует 7 дней, одноразовая)</span>
      </div>
      <input
        readOnly
        value={link}
        aria-label="одноразовая ссылка"
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        className="invite-link-input block w-full border border-line bg-elev px-2 py-1 outline-none focus:border-accent"
      />
      <div className="invite-link-actions flex items-center gap-2">
        <button
          type="button"
          className="invite-link-copy btn btn-primary"
          aria-live="polite"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? <>скопировано <Icon name="check" /></> : 'копировать'}
        </button>
        <button type="button" className="invite-link-close btn" onClick={onClose}>
          закрыть
        </button>
        <span className="invite-link-note text-muted text-[14px]">// отправь ссылку сам (почта, мессенджер); позже её не показать — только создать новую</span>
      </div>
    </div>
  );
}

/** Модератор приглашает только участников; роль выбирают owner/admin */
export function InvitesPanel({ role: myRole }: { role: GlobalRole }) {
  const invites = useInvites();
  const boards = useBoards();
  const m = useInviteMutations();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<GlobalRole, 'owner'>>('member');
  const [grants, setGrants] = useState<BoardGrant[]>([]);
  const [addBoard, setAddBoard] = useState('');
  const [created, setCreated] = useState<InviteCreated | null>(null);

  const boardName = (id: number) => boards.data?.find((b) => b.id === id)?.name ?? `#${id}`;
  const free = (boards.data ?? []).filter((b) => !grants.some((g) => g.boardId === b.id));
  const error = m.create.error ?? m.resend.error ?? m.revoke.error;

  const submit = () => {
    if (!email.trim()) return;
    m.create.mutate(
      { email, role, boards: grants },
      {
        onSuccess: (inv) => {
          setCreated(inv);
          setEmail('');
          setGrants([]);
        },
      },
    );
  };

  return (
    <div className="invites-panel space-y-6">
      <section className="invite-form space-y-3 border border-line bg-elev p-4">
        <h2>## новое приглашение</h2>
        <div className="invite-form-main flex flex-wrap items-center gap-2">
          <input
            type="email"
            name="invite-email"
            autoComplete="off"
            spellCheck={false}
            aria-label="email приглашённого"
            value={email}
            placeholder="email приглашённого"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="invite-email-input w-64 border border-line bg-bg px-2 py-1 outline-none focus:border-accent"
          />
          <Select className="invite-role-select w-48" value={role} options={myRole === 'moderator' ? globalRoleOptions.slice(0, 1) : globalRoleOptions} onChange={(v) => setRole(v as Exclude<GlobalRole, 'owner'>)} />
        </div>

        <div className="invite-grants space-y-2">
          <div className="invite-grants-hint text-muted">доступ к доскам (можно выдать позже, из окна «участники» на доске)</div>
          {grants.map((g) => (
            <div key={g.boardId} className="invite-board-grant flex items-center gap-2">
              <span className="invite-grant-board w-48 truncate">{boardName(g.boardId)}</span>
              <Select
                className="invite-grant-role w-40"
                value={g.role}
                options={boardRoleOptions}
                onChange={(r) => setGrants(grants.map((x) => (x.boardId === g.boardId ? { ...x, role: r as BoardRole } : x)))}
              />
              <button type="button" aria-label={`убрать доступ к доске ${boardName(g.boardId)}`} className="invite-grant-remove btn btn-danger btn-icon" onClick={() => setGrants(grants.filter((x) => x.boardId !== g.boardId))}>
                ×
              </button>
            </div>
          ))}
          <Select
            className="invite-grant-add w-48"
            value={addBoard}
            placeholder={free.length ? '+ доска…' : 'все доски добавлены'}
            disabled={!free.length}
            options={free.map((b) => ({ value: String(b.id), label: b.name }))}
            onChange={(v) => {
              setGrants([...grants, { boardId: Number(v), role: 'editor' }]);
              setAddBoard('');
            }}
          />
        </div>

        {error && <p role="alert" className="invite-form-error text-danger">! {error.message}</p>}
        <button type="button" className="invite-submit btn btn-primary" disabled={!email.trim() || m.create.isPending} onClick={submit}>
          создать приглашение
        </button>
      </section>

      {created && <LinkBox created={created} onClose={() => setCreated(null)} />}

      <section className="invites-list-section mt-8 space-y-2">
        <h2 className="invites-title">## приглашения {invites.data && <span className="invites-count text-muted">({invites.data.length})</span>}</h2>
        {invites.isLoading && <p className="invites-loading text-muted">Загрузка…</p>}
        {invites.data?.length === 0 && <p className="invites-empty text-muted text-[14px]">// приглашений пока нет</p>}
        <ul className="invites-list space-y-1">
          {invites.data?.map((i: Invite) => (
            <li key={i.id} className="invite flex flex-wrap items-center justify-between gap-2 border border-line bg-bg px-3 py-2">
              <div className="invite-info min-w-0 space-y-0.5">
                <div>
                  {i.email} <span className={`invite-status ${STATUS[i.status].cls}`}>[{STATUS[i.status].label}]</span>
                  {i.role !== 'member' && <span className="invite-role-mark ml-2 text-xs text-danger">{ROLE_NAMES[i.role]}</span>}
                </div>
                <div className="invite-meta text-xs text-muted">
                  от @{i.invitedBy} · {formatDateTime(i.createdAt)}
                  {i.status === 'pending' && ` · до ${formatDateTime(i.expiresAt)}`}
                  {i.usedAt && ` · принято ${formatDateTime(i.usedAt)}`}
                  {i.boards.length > 0 && ` · ${i.boards.map((g) => `${boardName(g.boardId)}: ${ROLE_LABELS[g.role]}`).join(', ')}`}
                </div>
              </div>
              <div className="invite-actions flex gap-2">
                {i.status !== 'accepted' && (
                  <button
                    type="button"
                    className="invite-resend btn"
                    disabled={m.resend.isPending}
                    title="прежняя ссылка перестанет работать"
                    onClick={() => m.resend.mutate(i.id, { onSuccess: setCreated })}
                  >
                    новая ссылка
                  </button>
                )}
                {i.status === 'pending' && (
                  <button
                    type="button"
                    className="invite-revoke btn btn-danger"
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: `Отозвать приглашение для ${i.email}?`,
                        message: 'Ссылка перестанет работать.',
                        danger: true,
                      });
                      if (ok) m.revoke.mutate(i.id);
                    }}
                  >
                    отозвать
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
