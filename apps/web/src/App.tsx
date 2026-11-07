import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useMe, useSessionGuard } from './api/auth';
import { ROUTE_PATTERNS, ROUTES } from './consts/routes';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPage } from './pages/ResetPage';
import { BoardPage } from './pages/BoardPage';
import { TaskModal } from './features/board/TaskModal';
import { BoardsPage } from './pages/BoardsPage';
import { TimePage } from './pages/TimePage';
import { Layout } from './pages/HomePage';
import { applyTheme, useThemeStore } from './stores/theme';

export function App() {
  const theme = useThemeStore();
  useEffect(() => applyTheme(theme), [theme]);

  useSessionGuard();
  const { pathname } = useLocation();
  const me = useMe();
  if (me.isLoading) return <p className="app-loading p-4 text-muted">loading...</p>;
  if (me.isError) return <p className="app-error p-4 text-danger">! api unavailable</p>;
  // без входа доступны только вход, регистрация по приглашению и сброс пароля по ссылке
  if (!me.data) {
    if (pathname === ROUTES.REGISTER) return <RegisterPage />;
    if (pathname === ROUTES.RESET) return <ResetPage />;
    return <AuthPage />;
  }

  return (
    <Routes>
      <Route element={<Layout user={me.data} />}>
        <Route index element={<BoardsPage />} />
        <Route path={ROUTE_PATTERNS.BOARD} element={<BoardPage />}>
          <Route path={ROUTE_PATTERNS.TASK} element={<TaskModal user={me.data} />} />
        </Route>
        <Route path={ROUTE_PATTERNS.ADMIN} element={<AdminPage user={me.data} />} />
        <Route path={ROUTE_PATTERNS.TIME} element={<TimePage />} />
        <Route path={ROUTE_PATTERNS.NOT_FOUND} element={<Navigate to={ROUTES.HOME} replace />} />
      </Route>
    </Routes>
  );
}
