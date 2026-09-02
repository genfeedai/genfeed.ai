import {
  isThemePreference,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ReactElement } from 'react';

import { useSettingsStore } from '~store/use-settings-store';

const THEME_OPTIONS: ReadonlyArray<{
  label: string;
  value: ThemePreference;
}> = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export function ThemeSelector(): ReactElement {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const handleThemeChange = (value: string): void => {
    if (isThemePreference(value)) {
      setTheme(value);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <label
          className="text-sm text-foreground"
          htmlFor="extension-appearance"
        >
          Appearance
        </label>
        <p className="text-2xs text-muted-foreground">
          Match your device or choose a theme
        </p>
      </div>
      <Select value={theme} onValueChange={handleThemeChange}>
        <SelectTrigger
          id="extension-appearance"
          aria-label="Appearance"
          className="w-28"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {THEME_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
