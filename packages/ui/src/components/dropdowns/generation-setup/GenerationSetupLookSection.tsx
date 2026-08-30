'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { GenerationSetupLookSectionProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import GenerationSetupFieldRow from '@ui/dropdowns/generation-setup/GenerationSetupFieldRow';
import {
  GENERATION_SETUP_LOOK_FIELD_LABELS,
  GENERATION_SETUP_LOOK_FIELD_ORDER,
} from '@ui/dropdowns/generation-setup/generation-setup.constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

/**
 * Look tab: one Select row per look field the caller has options for. Empty
 * on the agent composer, which passes no `lookOptions` — the section then
 * renders nothing rather than a wall of empty controls.
 */
export default function GenerationSetupLookSection({
  lookOptions,
  onResetField,
  onSetField,
  reasons,
  setup,
}: GenerationSetupLookSectionProps) {
  const fieldsWithOptions = GENERATION_SETUP_LOOK_FIELD_ORDER.filter(
    (key) => (lookOptions[key]?.length ?? 0) > 0,
  );

  if (fieldsWithOptions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {fieldsWithOptions.map((key) => {
        const options = lookOptions[key] ?? [];

        return (
          <GenerationSetupFieldRow
            fieldKey={key}
            key={key}
            label={GENERATION_SETUP_LOOK_FIELD_LABELS[key]}
            onReset={onResetField}
            reason={reasons[key]}
            source={setup.sources[key] ?? 'agent'}
          >
            <Select
              onValueChange={(value) => onSetField(key, value)}
              value={setup.values[key] ?? ''}
            >
              <SelectTrigger
                aria-label={GENERATION_SETUP_LOOK_FIELD_LABELS[key]}
                className={cn('w-full', SHELL_CONTROL_HEIGHT_CLASS)}
              >
                <SelectValue
                  placeholder={GENERATION_SETUP_LOOK_FIELD_LABELS[key]}
                />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.key} value={String(option.key)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </GenerationSetupFieldRow>
        );
      })}
    </div>
  );
}
