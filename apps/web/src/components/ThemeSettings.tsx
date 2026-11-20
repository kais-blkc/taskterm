import { useEffect, useRef, useState } from 'react';
import { currentColors, FONT_MAX, FONT_MIN, useThemeStore } from '../stores/theme';
import { THEME_TOKENS } from '../themes';
import { usePopupStyle } from '../lib/usePopupStyle';
import { NAV_POSITION_LABELS, useLayoutStore, type NavPosition } from '../stores/layout';
import { NavButton } from './nav/NavButton';
import { useNav } from './nav/NavContext';
import { PresetSelect } from './PresetSelect';

export function ThemeSettings() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // закрываем по клику вне окна и по Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const store = useThemeStore();
  const colors = currentColors(store);
  const { position } = useNav();
  const { popup, style, floating } = usePopupStyle(open, root, position);
  const layout = useLayoutStore();

  return (
    <div ref={root} className="theme-settings relative">
      <NavButton icon="palette" label="тема" title="тема и вид панели" active={open} aria-expanded={open} className="theme-button" onClick={() => setOpen(!open)} />
      {open && <div className="modal-backdrop" onMouseDown={() => setOpen(false)} />}
      {open && (
        <div
          ref={popup}
          style={style}
          className={`modal-popup theme-settings-popup z-30 w-72 space-y-3 border border-line bg-elev p-3 shadow-lg ${floating ? '' : 'absolute right-0 z-10 mt-2'}`}
        >
          <PresetSelect />
          <div className="nav-position-setting space-y-1 max-sm:hidden">
            <div className="text-muted">панель кнопок</div>
            <div className="flex gap-1">
              {(Object.keys(NAV_POSITION_LABELS) as NavPosition[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={layout.navPosition === p}
                  className={`nav-position-${p} btn flex-1 ${layout.navPosition === p ? 'btn-active' : ''}`}
                  onClick={() => layout.setNavPosition(p)}
                >
                  {NAV_POSITION_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            {THEME_TOKENS.map((t) => (
              <label key={t} className="flex items-center justify-between">
                <span className="text-muted">{t}</span>
                <input
                  type="color"
                  value={colors[t]}
                  onChange={(e) => store.setColor(t, e.target.value)}
                  className="h-6 w-10 cursor-pointer border border-line bg-transparent"
                />
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">размер шрифта</span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                aria-label="уменьшить шрифт"
                disabled={store.fontSize <= FONT_MIN}
                onClick={() => store.setFontSize(store.fontSize - 1)}
                className="btn btn-icon h-6 w-6"
              >
                −
              </button>
              <span className="w-12 text-center">{store.fontSize}px</span>
              <button
                type="button"
                aria-label="увеличить шрифт"
                disabled={store.fontSize >= FONT_MAX}
                onClick={() => store.setFontSize(store.fontSize + 1)}
                className="btn btn-icon h-6 w-6"
              >
                +
              </button>
            </span>
          </div>
          <button type="button" onClick={store.reset} className="btn btn-danger">
            сбросить
          </button>
        </div>
      )}
    </div>
  );
}
