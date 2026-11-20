import { lazy, Suspense, useRef, useState } from 'react';
import { attachmentKind, formatBytes, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, type Attachment } from '@taskterm/shared';
import { attachmentUrl, useAttachments, useDeleteAttachment, useUploadFiles } from '../../api/attachments';
import { Icon } from '../../components/Icon';
import { confirmDialog } from '../../stores/confirm';
import { useObjectUrl } from '../../lib/useObjectUrl';
import { useUploads, type UploadItem } from '../../stores/uploads';

const AttachmentLightbox = lazy(() => import('./AttachmentLightbox'));

const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.slice(0, 5).toUpperCase() : 'FILE');

/** Превью одного файла: картинка, видео (кадр + ▶) или плитка с расширением */
function Tile({ a, canEdit, onOpen, onDelete }: { a: Attachment; canEdit: boolean; onOpen: () => void; onDelete: () => void }) {
  const kind = attachmentKind(a.mime);
  const viewable = kind === 'image' || kind === 'video';
  const preview =
    kind === 'image' ? (
      <img src={attachmentUrl(a.id)} alt={a.name} loading="lazy" className="attachment-image h-full w-full object-cover" />
    ) : kind === 'video' ? (
      <>
        <video src={`${attachmentUrl(a.id)}#t=0.1`} preload="metadata" muted playsInline className="attachment-video h-full w-full object-cover" />
        <span className="attachment-play absolute inset-0 flex items-center justify-center bg-black/30 text-white">
          <Icon name="play" className="h-8 w-8" />
        </span>
      </>
    ) : (
      <span className="attachment-file flex h-full w-full flex-col items-center justify-center gap-1 text-muted">
        <Icon name="file" className="h-8 w-8" />
        <span className="text-xs">{extOf(a.name)}</span>
      </span>
    );
  return (
    <li className="attachment space-y-1">
      <div className="attachment-preview relative aspect-square overflow-hidden border border-line bg-bg hover:border-accent">
        {viewable ? (
          // обычная ссылка: клик открывает просмотр, а Ctrl/Cmd/средняя кнопка/«открыть в новой вкладке» ведут на сам файл
          <a
            href={attachmentUrl(a.id)}
            target="_blank"
            rel="noopener"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onOpen();
            }}
            className="attachment-open block h-full w-full cursor-pointer"
            aria-label={`открыть ${a.name}`}
          >
            {preview}
          </a>
        ) : (
          <a
            href={attachmentUrl(a.id, kind !== 'pdf')}
            {...(kind === 'pdf' ? { target: '_blank', rel: 'noopener' } : {})}
            className="attachment-open block h-full w-full cursor-pointer"
            aria-label={kind === 'pdf' ? `открыть ${a.name}` : `скачать ${a.name}`}
          >
            {preview}
          </a>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={onDelete}
            className="attachment-delete btn btn-danger btn-icon absolute right-1 top-1 bg-bg"
            title="удалить файл"
            aria-label={`удалить ${a.name}`}
          >
            ×
          </button>
        )}
      </div>
      <div className="attachment-name truncate text-[14px]" title={a.name}>
        {a.name}
      </div>
      <div className="attachment-meta flex items-center justify-between text-xs text-muted">
        <span>{formatBytes(a.size)}</span>
        <span className="attachment-links flex items-center gap-2">
          {(viewable || kind === 'pdf') && (
            <a href={attachmentUrl(a.id)} target="_blank" rel="noopener" className="attachment-newtab hover:text-accent" aria-label={`открыть ${a.name} в новой вкладке`}>
              вкладка ↗
            </a>
          )}
          <a href={attachmentUrl(a.id, true)} className="attachment-download hover:text-accent" aria-label={`скачать ${a.name}`}>
            скачать
          </a>
        </span>
      </div>
    </li>
  );
}

/** Строка идущей загрузки: миниатюра видна сразу, ещё до ответа сервера */
function UploadRow({ u, onDismiss }: { u: UploadItem; onDismiss: () => void }) {
  const url = useObjectUrl(u.file ?? null);
  const isVideo = u.file?.type.startsWith('video/');
  return (
    <li className="attachments-upload flex items-center gap-2 border border-line bg-bg px-2 py-1 text-[14px]">
      <span className="attachments-upload-thumb flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-line text-muted">
        {url ? (
          isVideo ? (
            <video src={`${url}#t=0.1`} muted preload="metadata" className="h-full w-full object-cover" />
          ) : (
            <img src={url} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <Icon name="file" />
        )}
      </span>
      <span className="truncate">{u.name}</span>
      {u.status === 'error' ? (
        <>
          <span role="alert" className="ml-auto shrink-0 text-danger">! {u.error}</span>
          <button type="button" className="btn btn-icon" aria-label="убрать из списка" onClick={onDismiss}>
            ×
          </button>
        </>
      ) : (
        <span className="ml-auto shrink-0 tabular-nums text-muted">{u.status === 'preparing' ? 'сжатие…' : `${u.progress}%`}</span>
      )}
    </li>
  );
}

/** Блок «файлы» в окне задачи: до 10 штук по 50 МБ, фото сжимаются на лету, превью + просмотр в лайтбоксе */
export function Attachments({ taskId, boardId, canEdit }: { taskId: number; boardId: number; canEdit: boolean }) {
  const { data = [], isLoading, error } = useAttachments(taskId);
  const remove = useDeleteAttachment(taskId, boardId);
  const upload = useUploadFiles();
  const uploads = useUploads((s) => s.items).filter((u) => u.taskId === taskId);
  const dismiss = useUploads((s) => s.remove);
  const input = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);

  const viewable = data.filter((a) => attachmentKind(a.mime) === 'image' || attachmentKind(a.mime) === 'video');
  const pending = uploads.filter((u) => u.status === 'preparing' || u.status === 'uploading').length;
  const full = data.length + pending >= MAX_ATTACHMENTS;
  const add = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length) void upload(taskId, boardId, list, { existing: data.length + pending });
  };

  return (
    <section
      className={`attachments mt-8 space-y-2 ${drag ? 'outline outline-1 outline-accent' : ''}`}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDrag(false);
        add(e.dataTransfer.files);
      }}
    >
      <h3 className="attachments-title flex items-center justify-between gap-2">
        <span>
          ## файлы <span className="text-muted">({data.length}/{MAX_ATTACHMENTS})</span>
        </span>
        {canEdit && (
          <button type="button" className="attachments-add btn" disabled={full} onClick={() => input.current?.click()}>
            <Icon name="clip" /> добавить
          </button>
        )}
      </h3>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) add(e.target.files);
          e.target.value = ''; // тот же файл можно выбрать снова
        }}
      />
      {isLoading && <p className="attachments-loading text-muted">Загрузка…</p>}
      {error && <p role="alert" className="attachments-error text-danger">! не удалось загрузить файлы</p>}
      {!isLoading && data.length === 0 && uploads.length === 0 && (
        <p className="attachments-empty text-muted text-[14px]">
          // {canEdit ? `файлов нет — перетащите сюда или нажмите «добавить» (до ${MAX_ATTACHMENTS}, до ${formatBytes(MAX_ATTACHMENT_BYTES)} каждый; фото сжимаются)` : 'файлов нет'}
        </p>
      )}
      {uploads.length > 0 && (
        <ul className="attachments-uploads space-y-1">
          {uploads.map((u) => (
            <UploadRow key={u.id} u={u} onDismiss={() => dismiss(u.id)} />
          ))}
        </ul>
      )}
      {data.length > 0 && (
        <ul className="attachments-grid grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {data.map((a) => (
            <Tile
              key={a.id}
              a={a}
              canEdit={canEdit}
              onOpen={() => setLightbox(viewable.findIndex((v) => v.id === a.id))}
              onDelete={async () => {
                if (await confirmDialog({ title: 'Удалить файл?', message: `${a.name} будет удалён безвозвратно.`, danger: true })) remove.mutate(a.id);
              }}
            />
          ))}
        </ul>
      )}
      {remove.error && <p role="alert" className="text-danger">! {remove.error.message}</p>}
      {lightbox !== null && lightbox >= 0 && (
        <Suspense fallback={null}>
          <AttachmentLightbox items={viewable} index={lightbox} onClose={() => setLightbox(null)} />
        </Suspense>
      )}
    </section>
  );
}
