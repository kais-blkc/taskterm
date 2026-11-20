import { Icon } from '../../components/Icon';
import { useState } from 'react';

/** Одноразовая ссылка, которую админ пересылает сам; позже её не показать */
export function OneTimeLink({ title, hint, link, onClose }: { title: string; hint: string; link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="one-time-link space-y-2 border border-accent bg-bg p-3">
      <div className="one-time-link-title">
        {title} <span className="one-time-link-hint text-muted">({hint})</span>
      </div>
      <input
        readOnly
        value={link}
        aria-label="одноразовая ссылка"
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        className="one-time-link-input block w-full border border-line bg-elev px-2 py-1 outline-none focus:border-accent"
      />
      <div className="one-time-link-actions flex items-center gap-2">
        <button
          type="button"
          className="one-time-link-copy btn btn-primary"
          aria-live="polite"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? <>скопировано <Icon name="check" /></> : 'копировать'}
        </button>
        <button type="button" className="one-time-link-close btn" onClick={onClose}>
          закрыть
        </button>
        <span className="one-time-link-note text-muted text-[14px]">// ссылка показывается один раз</span>
      </div>
    </div>
  );
}
