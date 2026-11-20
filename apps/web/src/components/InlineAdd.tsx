import { useRef, useState } from 'react';
import { formatBytes, MAX_ATTACHMENTS } from '@taskterm/shared';
import { useObjectUrl } from '../lib/useObjectUrl';
import { Icon } from './Icon';

/** Миниатюра выбранного файла: картинка/видео сразу, остальное — иконка */
function FileThumb({ file }: { file: File }) {
  const url = useObjectUrl(file);
  const cls = 'inline-add-thumb h-8 w-8 shrink-0 border border-line object-cover';
  if (url && file.type.startsWith('image/')) return <img src={url} alt="" className={cls} />;
  if (url) return <video src={`${url}#t=0.1`} muted preload="metadata" className={cls} />;
  return (
    <span className={`${cls} flex items-center justify-center`}>
      <Icon name="file" />
    </span>
  );
}

export function InlineAdd({
  label,
  placeholder,
  onSubmit,
  open: openProp,
  onOpenChange,
  withFiles = false,
}: {
  label: string;
  placeholder: string;
  onSubmit: (value: string, files: File[]) => void;
  /** внешнее управление (для хоткея n); без него компонент сам хранит состояние */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** можно приложить файлы (до 10): задача создаётся, потом файлы грузятся в фоне */
  withFiles?: boolean;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = (v: boolean) => {
    setInnerOpen(v);
    onOpenChange?.(v);
  };
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const picker = useRef<HTMLInputElement>(null);

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
    setFiles([]);
  };
  const addFiles = (list: FileList | null) => {
    if (list) setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_ATTACHMENTS));
  };
  return (
    <form
      ref={form}
      className="inline-add-form space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (v) onSubmit(v, files);
        close();
      }}
    >
      <div className="inline-add-row flex items-stretch gap-1">
        <input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && close()}
          // уход фокуса на кнопку 📎 (внутри формы) форму не закрывает
          onBlur={(e) => !value.trim() && !files.length && !form.current?.contains(e.relatedTarget) && close()}
          className="inline-add-input min-w-0 flex-1 border border-accent bg-elev px-2 py-1 outline-none"
        />
        {withFiles && (
          <>
            <button
              type="button"
              className="inline-add-attach btn btn-icon"
              title={`прикрепить файлы (до ${MAX_ATTACHMENTS})`}
              aria-label="прикрепить файлы"
              onClick={() => picker.current?.click()}
            >
              <Icon name="clip" />
            </button>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
                (form.current?.querySelector('.inline-add-input') as HTMLInputElement | null)?.focus();
              }}
            />
          </>
        )}
      </div>
      {files.length > 0 && (
        <ul className="inline-add-files space-y-1 text-xs text-muted">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-add-file flex items-center gap-1">
              <FileThumb file={f} />
              <span className="min-w-0 flex-1 truncate" title={f.name}>
                {f.name}
              </span>
              <span className="shrink-0 tabular-nums">{formatBytes(f.size)}</span>
              <button type="button" className="inline-add-file-remove cursor-pointer hover:text-danger" aria-label={`убрать ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
