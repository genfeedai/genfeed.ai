'use client';

import type { PromptBarCrunControlsProps } from '@genfeedai/props/studio/prompt-bar.props';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';

export default function PromptBarCrunControls({
  controls,
  value,
  onChange,
  isDisabled,
  error,
}: PromptBarCrunControlsProps) {
  const translate = useTranslations('pages.studioPlayground');
  const field = controls.fields.output_format;
  const options =
    field?.enum?.filter(
      (option): option is string => typeof option === 'string',
    ) ?? [];
  if (!options.length) return null;
  return (
    <Select
      disabled={isDisabled}
      value={value ?? String(field?.default ?? options[0])}
      onValueChange={onChange}
    >
      <SelectTrigger
        aria-label={translate('crun.outputFormat')}
        aria-invalid={Boolean(error)}
        aria-description={error}
      >
        <SelectValue placeholder={translate('crun.outputFormat')} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
