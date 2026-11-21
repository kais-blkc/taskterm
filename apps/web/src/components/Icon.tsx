export type IconName = 'lock' | 'check' | 'checklist' | 'bell' | 'clip' | 'file' | 'play' | 'menu' | 'chat' | 'pin' | 'home' | 'clock' | 'shield' | 'palette' | 'user' | 'logout' | 'search' | 'users' | 'edit';

const PATHS: Record<IconName, React.ReactNode> = {
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="1" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  check: <path d="M4 12.5 9.5 18 20 6.5" />,
  bell: (
    <>
      <path d="M6 16V10a6 6 0 0 1 12 0v6l2 2H4z" />
      <path d="M10 21h4" />
    </>
  ),
  clip: <path d="M20.5 11.5 12 20a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />,
  file: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </>
  ),
  play: <path d="M8 5v14l11-7z" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  home: <path d="M4 11 12 4l8 7v9H4z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  shield: <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" />,
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.5-2.2-.6-1.4.2-2.8 1.8-2.8H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3z" />
      <path d="M7.5 11h.01M10 7.5h.01M14.5 7.5h.01" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H4v16h6" />
      <path d="M9 12h12M17 8l4 4-4 4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </>
  ),
  pin: (
    <>
      <path d="M9 3h6l-1 6 3 3H7l3-3z" />
      <path d="M12 12v9" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
      <path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2.4.7 4 2.4 4 5.2" />
    </>
  ),
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  checklist: (
    <>
      <path d="m3 6 1.8 1.8L8 4.5" />
      <path d="m3 14 1.8 1.8L8 12.5" />
      <path d="M12 6h9M12 14h9M12 20h9" />
    </>
  ),
};

/** Линейные SVG-иконки (цвет — currentColor, размер — 1em), вместо эмодзи */
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon icon-${name} inline-block h-[1em] w-[1em] shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Иконка замка: пояснение скрыто и показывается при наведении (или фокусе) */
export function LockHint({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span
      className={`lock-hint group relative inline-flex cursor-help align-middle text-muted ${className}`}
      tabIndex={0}
      aria-label={text}
    >
      <Icon name="lock" />
      <span
        role="tooltip"
        className="lock-hint-tooltip pointer-events-none absolute left-1/2 top-full z-40 mt-1 hidden w-max max-w-64 -translate-x-1/2 whitespace-normal border border-muted bg-bg px-2 py-1 text-[14px] font-normal text-fg shadow-2xl group-hover:block group-focus:block"
      >
        {text}
      </span>
    </span>
  );
}
