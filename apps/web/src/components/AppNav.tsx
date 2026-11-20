import { Link, useLocation } from 'react-router-dom';
import { isStaffRole, type Me } from '@taskterm/shared';
import { useLogout } from '../api/auth';
import { ROUTES } from '../consts/routes';
import { MOD_KEY } from '../lib/keys';
import { useLayoutStore } from '../stores/layout';
import { useUiStore } from '../stores/ui';
import { ChatButton } from './ChatButton';
import { NavButton } from './nav/NavButton';
import { useNav } from './nav/NavContext';
import { NotifyToggle } from './NotifyToggle';
import { ProfileMenu } from './ProfileMenu';
import { ThemeSettings } from './ThemeSettings';

/**
 * Пункты панели — один список для шапки и боковой панели. `all` — со входом на главную и чатом (в боковой панели они в списке);
 * `menu` — без них (в шапке чат стоит отдельно, вне бургер-меню, а главная — бренд).
 */
export function NavItems({ user, include }: { user: Me; include: 'menu' | 'all' }) {
  const logout = useLogout();
  const { pathname } = useLocation();
  const on = (route: string) => pathname === route || pathname.startsWith(`${route}/`);
  return (
    <>
      {include === 'all' && <NavButton icon="home" label="доски" title="все доски" active={pathname === ROUTES.HOME || pathname.startsWith('/b/')} className="home-link" to={ROUTES.HOME} />}
      {include === 'all' && <ChatButton />}
      <NavButton icon="search" label={`${MOD_KEY}+K`} title="командная палитра" className="palette-button max-sm:hidden" onClick={() => useUiStore.getState().setPaletteOpen(true)} />
      <NavButton icon="clock" label="время" title="мои часы и отчёт" active={on(ROUTES.TIME)} className="time-link" to={ROUTES.TIME} />
      {isStaffRole(user.role) && <NavButton icon="shield" label="админка" title="админ-панель" active={on(ROUTES.ADMIN)} className="admin-link" to={ROUTES.ADMIN} />}
      <NotifyToggle />
      <ThemeSettings />
      <ProfileMenu user={user} />
      <NavButton icon="logout" label="выйти" danger className="logout-button" onClick={() => logout.mutate()} />
    </>
  );
}

/** Боковая панель (слева или справа): иконка + текст у каждого пункта; в минимальном виде — только иконки */
export function SideNav({ user }: { user: Me }) {
  const { collapsed, position } = useNav();
  const setCollapsed = useLayoutStore((s) => s.setNavCollapsed);
  const left = position === 'left';
  return (
    <aside
      className={`app-sidenav sticky top-0 z-20 flex h-dvh shrink-0 flex-col border-line bg-elev ${left ? 'border-r' : 'border-l'} ${collapsed ? 'w-14' : 'w-52'}`}
      aria-label="панель кнопок"
    >
      <Link to={ROUTES.HOME} className="app-brand whitespace-nowrap px-4 py-3 text-center hover:text-accent" title="taskterm">
        {collapsed ? '$' : '$ taskterm'}
      </Link>
      <nav className="app-sidenav-items flex flex-1 flex-col py-1">
        <NavItems user={user} include="all" />
      </nav>
      <button
        type="button"
        className="app-sidenav-toggle flex w-full cursor-pointer items-center justify-center gap-2 border-t border-line px-3 py-2 text-muted hover:text-accent"
        aria-pressed={collapsed}
        title={collapsed ? 'развернуть панель' : 'свернуть до значков'}
        aria-label={collapsed ? 'развернуть панель' : 'свернуть панель до значков'}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span aria-hidden>{(left ? !collapsed : collapsed) ? '«' : '»'}</span>
        {!collapsed && <span>свернуть</span>}
      </button>
    </aside>
  );
}
