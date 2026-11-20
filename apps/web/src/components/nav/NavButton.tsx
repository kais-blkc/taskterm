import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../Icon';
import { useNav } from './NavContext';

/**
 * Один пункт панели. В шапке — обычная кнопка с текстом; сбоку — иконка + текст, в минимальном виде — одна иконка (подпись в подсказке).
 * Все пункты (ссылки и кнопки) рисуются этим компонентом, поэтому вид панели меняется в одном месте.
 */
export function NavButton({
  icon,
  label,
  title,
  to,
  onClick,
  active,
  danger,
  disabled,
  badge,
  collapsedBadge,
  content,
  showIconInBar,
  buttonRef,
  className = '',
  ...aria
}: {
  icon: IconName;
  /** подпись; в минимальном виде — подсказка и aria-label */
  label: string;
  title?: string;
  to?: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** значок рядом с подписью (счётчик, состояние) */
  badge?: ReactNode;
  /** значок на иконке в минимальном виде боковой панели (по умолчанию пусто: текст там не помещается) */
  collapsedBadge?: ReactNode;
  /** вместо текста подписи (например, цветное имя пользователя) */
  content?: ReactNode;
  /** в шапке рядом с текстом тоже рисовать иконку */
  showIconInBar?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
  'aria-pressed'?: boolean;
  'aria-expanded'?: boolean;
}) {
  const { variant, collapsed } = useNav();
  const hint = title ?? label;
  const common = { title: collapsed && variant === 'side' ? label : hint, 'aria-label': label, ...aria };

  if (variant === 'bar') {
    const cls = `nav-item nav-item-bar btn ${active ? 'btn-active' : ''} ${danger ? 'btn-danger' : ''} ${className}`;
    const body = (
      <>
        {showIconInBar && <Icon name={icon} />}
        {content ?? label}
        {badge}
      </>
    );
    return to ? (
      <Link to={to} className={cls} {...common}>
        {body}
      </Link>
    ) : (
      <button type="button" ref={buttonRef} className={cls} onClick={onClick} disabled={disabled} {...common}>
        {body}
      </button>
    );
  }

  // боковая панель: полоса слева/справа от пункта отмечает активный
  const cls = `nav-item nav-item-side relative flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left ${collapsed ? 'justify-center px-0' : ''} ${
    active ? 'bg-bg text-accent' : danger ? 'hover:text-danger' : 'hover:text-accent'
  } disabled:cursor-not-allowed disabled:opacity-40 ${className}`;
  const body = (
    <>
      <span className="nav-item-icon relative flex shrink-0 text-[1.15em]">
        <Icon name={icon} />
        {collapsed && collapsedBadge && <span className="nav-item-badge-dot absolute -right-2 -top-2">{collapsedBadge}</span>}
      </span>
      {!collapsed && (
        <>
          <span className="nav-item-label min-w-0 flex-1 truncate">{content ?? label}</span>
          {badge}
        </>
      )}
    </>
  );
  return to ? (
    <Link to={to} className={cls} {...common}>
      {body}
    </Link>
  ) : (
    <button type="button" ref={buttonRef} className={cls} onClick={onClick} disabled={disabled} {...common}>
      {body}
    </button>
  );
}
