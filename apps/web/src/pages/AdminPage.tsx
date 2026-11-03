import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { Me } from '@taskterm/shared';
import { ROUTES } from '../consts/routes';
import { AuditPanel } from '../features/admin/AuditPanel';
import { BoardsPanel } from '../features/admin/BoardsPanel';
import { InvitesPanel } from '../features/admin/InvitesPanel';
import { UsersPanel } from '../features/admin/UsersPanel';

const TABS = [
  { id: 'users', label: 'пользователи' },
  { id: 'invites', label: 'приглашения' },
  { id: 'boards', label: 'доски' },
  { id: 'audit', label: 'журнал' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** Админ-панель (только admin): пользователи, приглашения, доски, журнал */
export function AdminPage({ user }: { user: Me }) {
  const [tab, setTab] = useState<Tab>('users');
  if (user.role !== 'admin') return <Navigate to={ROUTES.HOME} replace />;
  return (
    <div className="admin-page mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="page-title">$ admin</h1>
      <nav className="admin-tabs flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`admin-tab btn ${tab === t.id ? 'btn-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'users' && <UsersPanel meId={user.id} />}
      {tab === 'invites' && <InvitesPanel />}
      {tab === 'boards' && <BoardsPanel meId={user.id} />}
      {tab === 'audit' && <AuditPanel />}
    </div>
  );
}
