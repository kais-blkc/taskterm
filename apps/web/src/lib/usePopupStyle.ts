import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

/**
 * Положение всплывающего окна кнопки панели. Сверху — обычное (абсолютное, из классов). Сбоку окно открывается рядом с панелью
 * (fixed): справа от левой панели, слева от правой; по высоте прижато к кнопке, но не уходит за экран.
 */
export function usePopupStyle(open: boolean, anchor: RefObject<HTMLElement | null>, side: 'top' | 'left' | 'right' | 'drawer') {
  const popup = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | undefined>();
  useLayoutEffect(() => {
    // drawer: на телефоне окно по центру задаёт CSS (.modal-popup)
    if (!open || side === 'top' || side === 'drawer' || !anchor.current) return setStyle(undefined);
    const r = anchor.current.getBoundingClientRect();
    const h = popup.current?.offsetHeight ?? 0;
    const top = Math.max(8, Math.min(r.top, window.innerHeight - h - 8));
    setStyle(side === 'left' ? { position: 'fixed', left: r.right + 8, top } : { position: 'fixed', right: window.innerWidth - r.left + 8, top });
  }, [open, side, anchor]);
  return { popup, style, floating: side !== 'top' };
}
