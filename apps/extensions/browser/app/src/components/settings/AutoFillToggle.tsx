import type { ReactElement } from 'react';

import { useSettingsStore } from '~store/use-settings-store';

export function AutoFillToggle(): ReactElement {
  const autoFill = useSettingsStore((s) => s.autoFill);
  const setAutoFill = useSettingsStore((s) => s.setAutoFill);

  return (
    <label className="flex items-center justify-between">
      <div>
        <span className="text-sm text-foreground">Auto-fill compose box</span>
        <p className="text-[11px] text-muted-foreground">
          Automatically insert content after generation
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={autoFill}
        onClick={() => setAutoFill(!autoFill)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          autoFill ? 'bg-primary' : 'bg-border'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            autoFill ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}
