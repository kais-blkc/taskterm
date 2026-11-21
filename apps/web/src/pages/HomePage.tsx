import { useEffect, useState, type CSSProperties } from 'react';
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
  const [timerSlot, setTimerSlot] = useState<HTMLElement | null>(null);
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
  // на телефоне бургер открывает то же боковое меню (выезжает с выбранной стороны, по умолчанию слева)
  useEffect(() => {
    if (desktop) setMenuOpen(false);
  }, [desktop]);
  const side = position === 'top' ? '0px' : navCollapsed ? '3.5rem' : '13rem';
  const vars = { '--nav-left': position === 'left' ? side : '0px', '--nav-right': position === 'right' ? side : '0px', '--app-header': position === 'top' ? '3.25rem' : '0px' } as CSSProperties;
  const sideNav = <SideNav user={user} />;

  return (
    <div className="app-layout" style={vars}>
      {position === 'top' ? (
        <NavContext.Provider value={{ variant: 'bar', collapsed: false, position: 'top' }}>
          <header className="app-header relative flex items-center justify-between gap-2 border-b border-line px-4 py-2">
            <Link to={ROUTES.HOME} className="app-brand whitespace-nowrap hover:text-accent">
              $ taskterm
            </Link>
            {/* на телефоне таймер живёт здесь (компактно), а не плавает поверх контента */}
            <div ref={setTimerSlot} className="app-timer-slot flex min-w-0 flex-1 justify-center" />
            <div className="app-header-right flex items-center gap-2">
              {/* чат нужен часто — он всегда в шапке, не в меню */}
              <ChatButton />
              {!desktop && (
                <button
                  type="button"
                  className={`app-burger btn btn-icon ${menuOpen ? 'btn-active' : ''}`}
                  aria-expanded={menuOpen}
                  aria-controls="app-drawer"
                  aria-label="меню"
                  title="меню"
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  <Icon name="menu" />
                </button>
              )}
              {/* широкий экран с панелью сверху — обычная строка кнопок */}
              {desktop && (
                <div className="app-header-actions flex flex-wrap items-center gap-2">
                  <NavItems user={user} include="menu" />
                </div>
              )}
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
      {/* выезжающее боковое меню на телефоне */}
      {!desktop && menuOpen && (
        <>
          <div className="app-drawer-overlay fixed inset-0 z-30 bg-black/60" onMouseDown={() => setMenuOpen(false)} aria-hidden />
          <div id="app-drawer">
            <NavContext.Provider value={{ variant: 'side', collapsed: false, position: 'drawer' }}>
              <SideNav user={user} drawerSide={navPosition === 'right' ? 'right' : 'left'} onClose={() => setMenuOpen(false)} />
            </NavContext.Provider>
          </div>
        </>
      )}
      {/* таймер: на широком экране плавающая панель (fixed), на телефоне — компактная плашка в шапке */}
      <WorkTimer slot={desktop ? null : timerSlot} />
      <CommandPalette />
      <HelpOverlay />
      <ConfirmDialog />
      <UploadsToast />
    </div>
  );
}
