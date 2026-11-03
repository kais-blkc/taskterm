import { useAudit } from '../../api/admin';
import { formatDateTime } from '../../lib/dates';

const ACTIONS: Record<string, string> = {
  'user.role': 'сменил роль',
  'user.block': 'заблокировал',
  'user.unblock': 'разблокировал',
  'user.delete': 'удалил пользователя',
  'user.reset_link': 'выдал ссылку сброса пароля',
  'invite.create': 'создал приглашение',
  'invite.resend': 'обновил ссылку приглашения',
  'invite.revoke': 'отозвал приглашение',
  'task.policy': 'изменил права задачи',
  'task.owner': 'передал владение задачей',
  'board.delete': 'удалил доску',
  'board.member': 'назначил роль на доске',
  'board.member_remove': 'убрал участника с доски',
};

const compact = (d: Record<string, unknown>) =>
  Object.entries(d)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' ');

export function AuditPanel() {
  const audit = useAudit();
  const rows = audit.data?.pages.flat() ?? [];
  return (
    <section className="audit-panel space-y-2">
      <h2>## журнал действий</h2>
      {audit.isLoading && <p className="text-muted">loading...</p>}
      {!audit.isLoading && rows.length === 0 && <p className="text-muted">// записей пока нет</p>}
      <ul className="audit-list space-y-1">
        {rows.map((e) => (
          <li key={e.id} className="audit-entry border border-line bg-bg px-3 py-1.5">
            <div>
              <span className="text-muted">{formatDateTime(e.createdAt)}</span> @{e.actorName}{' '}
              <span>{ACTIONS[e.action] ?? e.action}</span> {e.target && <span className="text-muted">{e.target}</span>}
            </div>
            {Object.keys(e.details).length > 0 && <div className="break-all text-xs text-muted">{compact(e.details)}</div>}
          </li>
        ))}
      </ul>
      {audit.hasNextPage && (
        <button type="button" className="btn" disabled={audit.isFetchingNextPage} onClick={() => audit.fetchNextPage()}>
          ещё
        </button>
      )}
    </section>
  );
}
