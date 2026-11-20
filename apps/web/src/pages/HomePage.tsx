import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import type { Me } from '@taskterm/shared';
import { CommandPalette } from '../components/CommandPalette';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NavItems, SideNav } from '../components/AppNav';
import { ChatButton } from '../components/ChatButton';
import { NavContext } from '../components/nav/NavContext';
import { HelpOverlay } from '../components/HelpOverlay';
import { Icon } from '../components/Icon';
import { ROUTES } from '../consts/routes';
import { isTyping } from '../lib/keys';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useLayoutStore } from '../stores/layout';
import { useUiStore } from '../stores/ui';
import { useChatConnection } from '../api/chat';
import { useServerEvents } from '../api/events';
import { UploadsToast } from '../components/UploadsToast';
import { WorkTimer } from '../components/WorkTimer';

export function Layout({ user }: { user: Me }) {
  useServerEvents(user);
  useChatConnection(user);

  // бургер-меню на узких экранах: закрывается при переходе, по Esc и по клику вне шапки
  const [menuOpen, setMenuOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    const onDown = (e: MouseEvent) => !header.current?.contains(e.target as Node) && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [menuOpen]);

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
  const desktop = useMediaQuery('(min-width: 640px)');
  const { navPosition, navCollapsed } = useLayoutStore();
  // сбоку панель только на широких экранах; на узких — всегда шапка с бургером
  const position = desktop ? navPosition : 'top';
  const side = position === 'top' ? '0px' : navCollapsed ? '3.5rem' : '13rem';
  const vars = { '--nav-left': position === 'left' ? side : '0px', '--nav-right': position === 'right' ? side : '0px', '--app-header': position === 'top' ? '3.25rem' : '0px' } as CSSProperties;
  const sideNav = <SideNav user={user} />;

  return (
    <div className="app-layout" style={vars}>
      {position === 'top' ? (
        <NavContext.Provider value={{ variant: 'bar', collapsed: false, position: 'top' }}>
          <header ref={header} className="app-header relative flex items-center justify-between gap-2 border-b border-line px-4 py-2">
            <Link to={ROUTES.HOME} className="app-brand whitespace-nowrap hover:text-accent">
              $ taskterm
            </Link>
            <div className="app-header-right flex items-center gap-2">
              {/* чат нужен часто — он всегда в шапке, не в меню */}
              <ChatButton />
              <button
                type="button"
                className={`app-burger btn btn-icon sm:hidden ${menuOpen ? 'btn-active' : ''}`}
                aria-expanded={menuOpen}
                aria-controls="app-menu"
                aria-label="меню"
                title="меню"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <Icon name="menu" />
              </button>
              {/* узкий экран — выпадающая панель под шапкой (бургер), широкий — обычная строка кнопок */}
              <div
                id="app-menu"
                className={`app-header-actions ${menuOpen ? 'flex' : 'hidden'} absolute inset-x-0 top-full z-30 flex-wrap items-center gap-2 border-b border-line bg-bg p-3 sm:static sm:z-auto sm:flex sm:border-0 sm:bg-transparent sm:p-0`}
              >
                <NavItems user={user} include="menu" />
              </div>
            </div>
          </header>
        </NavContext.Provider>
      ) : null}
      <div className={position === 'top' ? '' : 'flex min-h-dvh'}>
        {position !== 'top' && position === 'left' && (
          <NavContext.Provider value={{ variant: 'side', collapsed: navCollapsed, position }}>{sideNav}</NavContext.Provider>
        )}
        <div className="app-content min-w-0 flex-1">
          <Outlet />
        </div>
        {position === 'right' && <NavContext.Provider value={{ variant: 'side', collapsed: navCollapsed, position }}>{sideNav}</NavContext.Provider>}
      </div>
      {/* таймер — плавающая панель (fixed): одна на приложение, где бы ни стояла панель кнопок */}
      <WorkTimer />
      <CommandPalette />
      <HelpOverlay />
      <ConfirmDialog />
      <UploadsToast />
    </div>
  );
}
