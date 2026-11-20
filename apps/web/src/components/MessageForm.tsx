import { useState } from 'react';

/**
 * Поле ввода сообщения с кнопкой внутри (комментарии, правка комментария, чат). Кнопка неактивна, пока нет текста.
 * Отправка: Ctrl/Cmd+Enter; при `submitOnEnter` — просто Enter (Shift+Enter — перенос строки).
 */
export function MessageForm({
  initial = '',
  submitLabel,
  placeholder,
  onSubmit,
  onCancel,
  pending,
  disabled,
  submitOnEnter = false,
  maxLength,
  rows = 3,
  className = '',
}: {
  initial?: string;
  submitLabel: string;
  placeholder: string;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  pending?: boolean;
  /** отправка недоступна (например, нет связи): поле остаётся, кнопка выключена */
  disabled?: boolean;
  submitOnEnter?: boolean;
  maxLength?: number;
  rows?: number;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const send = () => {
    if (value.trim() && !pending && !disabled) {
      onSubmit(value.trim());
      if (!onCancel) setValue('');
    }
  };
  return (
    <div className={`message-form space-y-2 ${className}`}>
      <div className="relative">
        <textarea
          value={value}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            const mod = e.ctrlKey || e.metaKey;
            if (e.key === 'Enter' && (mod || (submitOnEnter && !e.shiftKey))) {
              e.preventDefault();
              send();
            }
            if (e.key === 'Escape') onCancel?.();
          }}
          className="message-form-input block w-full resize-y border border-line bg-bg px-2 py-1 pb-10 outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || disabled || !value.trim()}
          className="message-form-submit btn btn-primary absolute bottom-2 right-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} className="message-form-cancel btn">
          отмена
        </button>
      )}
    </div>
  );
}
