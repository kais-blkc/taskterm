import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from './api/auth';
import { ROUTE_PATTERNS, ROUTES } from './consts/routes';
import { AuthPage } from './pages/AuthPage';
import { BoardPage } from './pages/BoardPage';
import { TaskModal } from './features/board/TaskModal';
import { BoardsPage } from './pages/BoardsPage';
import { Layout } from './pages/HomePage';
import { applyTheme, useThemeStore } from './stores/theme';

export function App() {
  const theme = useThemeStore();
  useEffect(() => applyTheme(theme), [theme]);

  const me = useMe();
  if (me.isLoading) return <p className="p-4 text-muted">loading...</p>;
  if (me.isError) return <p className="p-4 text-danger">! api unavailable</p>;
  if (!me.data) return <AuthPage />;

  return (
    <Routes>
      <Route element={<Layout user={me.data} />}>
        <Route index element={<BoardsPage />} />
        <Route path={ROUTE_PATTERNS.BOARD} element={<BoardPage />}>
          <Route path={ROUTE_PATTERNS.TASK} element={<TaskModal user={me.data} />} />
        </Route>
        <Route path={ROUTE_PATTERNS.NOT_FOUND} element={<Navigate to={ROUTES.HOME} replace />} />
      </Route>
    </Routes>
  );
}
