'use client';

import type { PlatformModeSettingFieldProps } from '@props/admin/platform-settings.props';
import Field from '@ui/primitives/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';

export default function PlatformModeSettingField<TMode extends string>({
  helpText,
  id,
  isDisabled,
  label,
  modes,
  onChange,
  value,
}: PlatformModeSettingFieldProps<TMode>) {
  const translate = useTranslations('pages.platformSettings.features.modes');

  return (
    <Field label={label} htmlFor={id} helpText={helpText}>
      <Select
        value={value}
        onValueChange={(next) => {
          const mode = modes.find((candidate) => candidate === next);
          if (mode) {
            onChange(mode);
          }
        }}
        disabled={isDisabled}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {modes.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {translate(mode)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
