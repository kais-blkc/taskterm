import { applyTheme, useThemeStore } from '../stores/theme';
import { findPreset, PRESETS } from '../themes';
import { Select } from './Select';

function Swatches({ id }: { id: string }) {
  const c = findPreset(id).colors;
  return (
    <span
      className="theme-swatches inline-flex h-5 w-14 shrink-0 items-center justify-center gap-1 border"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <i className="block h-2 w-2" style={{ background: c.fg }} />
      <i className="block h-2 w-2" style={{ background: c.accent }} />
      <i className="block h-2 w-2" style={{ background: c['fg-muted'] }} />
    </span>
  );
}

const options = PRESETS.map((p) => ({ value: p.id, label: p.name, icon: <Swatches id={p.id} /> }));

/** Выбор темы: наведение/стрелки показывают тему вживую, выход без выбора — откат */
export function PresetSelect() {
  const { presetId, setPreset } = useThemeStore();
  return (
    <Select
      options={options}
      value={presetId}
      onChange={setPreset}
      onPreview={(id) => {
        const state = useThemeStore.getState();
        applyTheme(id ? { ...state, presetId: id, overrides: {} } : state);
      }}
    />
  );
}
