import { useEffect } from 'react';
import { Link, Outlet } from 'react-router-dom';
import type { User } from '@taskterm/shared';
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
import { ThemeSettings } from '../components/ThemeSettings';

export function Layout({ user }: { user: User }) {
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
    <div>
      <header className="flex items-center justify-between border-b border-line px-4 py-2">
        <Link to={ROUTES.HOME} className="hover:text-accent">
          $ taskterm
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => useUiStore.getState().setPaletteOpen(true)}
            className="btn"
            title="командная палитра"
          >
            {MOD_KEY}+K
          </button>
          <NotifyToggle />
          <ThemeSettings />
          <ProfileMenu user={user} />
          <button type="button" onClick={() => logout.mutate()} className="btn btn-danger">
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
