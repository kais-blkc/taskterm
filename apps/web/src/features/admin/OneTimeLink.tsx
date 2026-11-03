import { useState } from 'react';

/** Одноразовая ссылка, которую админ пересылает сам; позже её не показать */
export function OneTimeLink({ title, hint, link, onClose }: { title: string; hint: string; link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="one-time-link space-y-2 border border-accent bg-bg p-3">
      <div>
        {title} <span className="text-muted">({hint})</span>
      </div>
      <input
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="block w-full border border-line bg-elev px-2 py-1 outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? 'скопировано ✓' : 'копировать'}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          закрыть
        </button>
        <span className="text-xs text-muted">// ссылка показывается один раз</span>
      </div>
    </div>
  );
}
