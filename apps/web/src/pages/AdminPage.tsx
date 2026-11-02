import { Navigate } from 'react-router-dom';
import type { Me } from '@taskterm/shared';
import { ROUTES } from '../consts/routes';
import { InvitesPanel } from '../features/admin/InvitesPanel';

/** Админ-панель (только admin). Сейчас — приглашения; пользователи, доски и журнал — следующий этап. */
export function AdminPage({ user }: { user: Me }) {
  if (user.role !== 'admin') return <Navigate to={ROUTES.HOME} replace />;
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1>$ admin</h1>
      <InvitesPanel />
    </div>
  );
}
