import { useEffect } from 'react';
import { Link, Outlet } from 'react-router-dom';
import type { Me } from '@taskterm/shared';
import { CommandPalette } from '../components/CommandPalette';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { HelpOverlay } from '../components/HelpOverlay';
import { ROUTES } from '../consts/routes';
import { isTyping, MOD_KEY } from '../lib/keys';
import { useUiStore } from '../stores/ui';
import { useLogout } from '../api/auth';
import { useServerEvents } from '../api/events';
import { NotifyToggle } from '../components/NotifyToggle';
import { ProfileMenu } from '../components/ProfileMenu';
import { WorkTimer } from '../components/WorkTimer';
import { ThemeSettings } from '../components/ThemeSettings';

export function Layout({ user }: { user: Me }) {
  const logout = useLogout();
  useServerEvents(user);

  // глобальные клавиши: Ctrl/Cmd+K — палитра, ? — подсказка
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUiStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
      } else if (e.key === '?' && !isTyping() && !ui.paletteOpen) {
        e.preventDefault();
        ui.setHelpOpen(!ui.helpOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="app-layout">
      <header className="app-header flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <Link to={ROUTES.HOME} className="app-brand whitespace-nowrap hover:text-accent">
          $ taskterm
        </Link>
        <div className="app-header-actions flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => useUiStore.getState().setPaletteOpen(true)}
            className="palette-button btn max-sm:hidden"
            title="командная палитра"
          >
            {MOD_KEY}+K
          </button>
          <WorkTimer />
          <Link to={ROUTES.TIME} className="time-link btn" title="мои часы и отчёт">
            time
          </Link>
          {user.role === 'admin' && (
            <Link to={ROUTES.ADMIN} className="admin-link btn" title="админ-панель">
              admin
            </Link>
          )}
          <NotifyToggle />
          <ThemeSettings />
          <ProfileMenu user={user} />
          <button type="button" onClick={() => logout.mutate()} className="logout-button btn btn-danger">
            logout
          </button>
        </div>
      </header>
      <Outlet />
      <CommandPalette />
      <HelpOverlay />
      <ConfirmDialog />
    </div>
  );
}
