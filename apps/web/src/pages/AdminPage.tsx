import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { isAdminRole, isStaffRole, type Me } from '@taskterm/shared';
import { ROUTES } from '../consts/routes';
import { AuditPanel } from '../features/admin/AuditPanel';
import { BoardsPanel } from '../features/admin/BoardsPanel';
import { ChatRoomsAdmin } from '../features/admin/ChatRoomsAdmin';
import { ChatSettings } from '../features/admin/ChatSettings';
import { InvitesPanel } from '../features/admin/InvitesPanel';
import { TimePanel } from '../features/admin/TimePanel';
import { UsersPanel } from '../features/admin/UsersPanel';

const TABS = [
  { id: 'users', label: 'пользователи', adminOnly: false },
  { id: 'invites', label: 'приглашения', adminOnly: false },
  { id: 'boards', label: 'доски', adminOnly: false },
  { id: 'chat', label: 'чат', adminOnly: true },
  { id: 'time', label: 'время', adminOnly: true },
  { id: 'audit', label: 'журнал', adminOnly: true },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** Админ-панель: owner/admin — всё; moderator — пользователи, приглашения, доски (без времени, ставок, журнала, ролей) */
export function AdminPage({ user }: { user: Me }) {
  const [params] = useSearchParams();
  // ссылка /admin?tab=boards&board=3 открывает вкладку «доски» с подсвеченной доской
  const wanted = TABS.find((t) => t.id === params.get('tab') && (!t.adminOnly || isAdminRole(user.role)));
  const [tab, setTab] = useState<Tab>(wanted?.id ?? 'users');
  const focusBoard = Number(params.get('board')) || undefined;
  if (!isStaffRole(user.role)) return <Navigate to={ROUTES.HOME} replace />;
  return (
    <div className="admin-page mx-auto max-w-4xl space-y-4 p-3 sm:p-6">
      <h1 className="admin-title page-title">$ админка</h1>
      <nav className="admin-tabs flex flex-wrap gap-2" aria-label="разделы админки">
        {TABS.filter((t) => !t.adminOnly || isAdminRole(user.role)).map((t) => (
          <button key={t.id} type="button" className={`admin-tab admin-tab-${t.id} btn ${tab === t.id ? 'btn-active' : ''}`} aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'users' && <UsersPanel me={user} />}
      {tab === 'invites' && <InvitesPanel role={user.role} />}
      {tab === 'boards' && <BoardsPanel meId={user.id} focusBoardId={focusBoard} />}
      {tab === 'chat' && isAdminRole(user.role) && (
        <div className="admin-chat space-y-4">
          <ChatRoomsAdmin />
          <ChatSettings />
        </div>
      )}
      {tab === 'time' && isAdminRole(user.role) && <TimePanel />}
      {tab === 'audit' && isAdminRole(user.role) && <AuditPanel />}
    </div>
  );
}
