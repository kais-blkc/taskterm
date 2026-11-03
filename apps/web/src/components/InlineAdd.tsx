import { useState } from 'react';

export function InlineAdd({
  label,
  placeholder,
  onSubmit,
  open: openProp,
  onOpenChange,
}: {
  label: string;
  placeholder: string;
  onSubmit: (value: string) => void;
  /** внешнее управление (для хоткея n); без него компонент сам хранит состояние */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = (v: boolean) => {
    setInnerOpen(v);
    onOpenChange?.(v);
  };
  const [value, setValue] = useState('');

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-add-button btn">
        + {label}
      </button>
    );
  }
  const close = () => {
    setOpen(false);
    setValue('');
  };
  return (
    <form className="inline-add-form"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (v) onSubmit(v);
        close();
      }}
    >
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        onBlur={() => !value.trim() && close()}
        className="inline-add-input w-full border border-accent bg-elev px-2 py-1 outline-none"
      />
    </form>
  );
}
