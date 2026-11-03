import { Icon } from './Icon';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  /** левая часть пункта: цветные образцы, иконка и т. п. */
  icon?: ReactNode;
}

/**
 * Единый выпадающий список в стиле терминала.
 * onPreview вызывается при наведении/стрелках (value) и при закрытии без выбора (null) —
 * так работает живое превью темы.
 */
export function Select({
  options,
  value,
  onChange,
  placeholder = 'выбрать…',
  onPreview,
  disabled,
  className = '',
  menuClassName = '',
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onPreview?: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  const close = () => {
    setOpen(false);
    setHover(-1);
    onPreview?.(null);
  };
  const choose = (v: string) => {
    setOpen(false);
    setHover(-1);
    onChange(v);
  };
  const highlight = (idx: number) => {
    setHover(idx);
    const o = options[idx];
    if (o) onPreview?.(o.value);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
        highlight(Math.max(0, options.findIndex((o) => o.value === value)));
      }
      return;
    }
    if (e.key === 'ArrowDown') (e.preventDefault(), highlight(Math.min(hover + 1, options.length - 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), highlight(Math.max(hover - 1, 0)));
    else if (e.key === 'Escape') (e.stopPropagation(), close());
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const o = options[hover];
      if (o) choose(o.value);
      else close();
    }
  };

  return (
    <div ref={root} className={`select relative ${className}`} onKeyDown={onKeyDown}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="select-button flex w-full items-center gap-2 border border-line bg-bg px-2 py-1 text-left hover:border-accent focus:border-accent focus:outline-none"
      >
        {current?.icon}
        <span className={`flex-1 truncate ${current ? '' : 'text-muted'}`}>{current?.label ?? placeholder}</span>
        <span className="text-muted">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className={`select-menu absolute left-0 z-30 mt-1 max-h-72 min-w-full overflow-y-auto border border-accent bg-elev ${menuClassName}`}
          onMouseLeave={() => {
            setHover(-1);
            onPreview?.(null);
          }}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => highlight(i)}
              onClick={() => choose(o.value)}
              className={`select-option flex cursor-pointer items-center gap-2 whitespace-nowrap px-2 py-1 ${
                i === hover ? 'bg-accent text-bg' : ''
              }`}
            >
              {o.icon}
              <span className="flex-1">{o.label}</span>
              {o.value === value && <Icon name="check" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
