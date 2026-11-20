import { useState } from 'react';
import { CHAT_DELETE_MODE_LABELS, chatDeleteModeSchema, type ChatDeleteMode } from '@taskterm/shared';
import { useChatSettings, useSaveChatSettings } from '../../api/chat';
import { Select } from '../../components/Select';

const modeOptions = chatDeleteModeSchema.options.map((v) => ({ value: v, label: CHAT_DELETE_MODE_LABELS[v] }));

/** Общие настройки чата: кто может удалять сообщения и сколько дней их хранить (0 — всегда) */
export function ChatSettings() {
  const settings = useChatSettings();
  const save = useSaveChatSettings();
  const [days, setDays] = useState<string | null>(null);
  if (!settings.data) return <p className="chat-settings-loading text-muted">Загрузка…</p>;
  const d = days ?? String(settings.data.retentionDays);
  const n = Number(d);
  const validDays = d.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 3650;

  return (
    <section className="chat-settings space-y-4 border border-line bg-elev p-4">
      <h2 className="chat-settings-title">## чат</h2>
      <div className="chat-settings-delete space-y-1">
        <div className="text-muted">кто удаляет сообщения</div>
        <Select
          className="chat-delete-mode w-72"
          value={settings.data.deleteMode}
          options={modeOptions}
          disabled={save.isPending}
          onChange={(v) => save.mutate({ ...settings.data, deleteMode: v as ChatDeleteMode })}
        />
      </div>
      <div className="chat-settings-retention space-y-1">
        <label className="text-muted" htmlFor="chat-retention-days">
          хранить сообщения, дней (0 — бессрочно)
        </label>
        <div className="flex items-center gap-2">
          <input
            id="chat-retention-days"
            value={d}
            inputMode="numeric"
            name="chat-retention-days"
            autoComplete="off"
            onChange={(e) => setDays(e.target.value)}
            className="chat-retention-input w-24 border border-line bg-bg px-2 py-1 outline-none focus:border-accent"
          />
          <button
            type="button"
            className="chat-retention-save btn btn-primary"
            disabled={!validDays || save.isPending || n === settings.data.retentionDays}
            onClick={() => save.mutate({ ...settings.data, retentionDays: n }, { onSuccess: () => setDays(null) })}
          >
            сохранить
          </button>
        </div>
        <p className="text-[14px] text-muted">// старше срока сообщения удаляются автоматически (проверка раз в сутки)</p>
      </div>
      {save.error && (
        <p role="alert" className="chat-settings-error text-danger">
          ! {save.error.message}
        </p>
      )}
    </section>
  );
}
