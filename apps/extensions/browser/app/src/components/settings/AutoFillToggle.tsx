import { Switch } from '@ui/primitives/switch';
import type { ReactElement } from 'react';

import { useSettingsStore } from '~store/use-settings-store';

export function AutoFillToggle(): ReactElement {
  const autoFill = useSettingsStore((s) => s.autoFill);
  const setAutoFill = useSettingsStore((s) => s.setAutoFill);

  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm text-foreground">Auto-fill compose box</span>
        <p className="text-2xs text-muted-foreground">
          Automatically insert content after generation
        </p>
      </div>
      <Switch
        aria-label="Auto-fill compose box"
        isChecked={autoFill}
        onCheckedChange={setAutoFill}
      />
    </div>
  );
}
