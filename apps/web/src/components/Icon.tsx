type IconName = 'lock' | 'check' | 'checklist';

const PATHS: Record<IconName, React.ReactNode> = {
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="1" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  check: <path d="M4 12.5 9.5 18 20 6.5" />,
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
