'use client';

import type {
  GenerationSetupLookFieldKey,
  GenerationSetupLookSectionProps,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupFieldRow from '@ui/dropdowns/generation-setup/GenerationSetupFieldRow';
import GenerationSetupOptionPicker from '@ui/dropdowns/generation-setup/GenerationSetupOptionPicker';
import {
  GENERATION_SETUP_LOOK_FIELD_LABELS,
  GENERATION_SETUP_LOOK_FIELD_ORDER,
} from '@ui/dropdowns/generation-setup/generation-setup.constants';
import { useState } from 'react';

/**
 * Look settings: one searchable option list per look field the caller has options for. Empty
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
  const [openField, setOpenField] = useState<GenerationSetupLookFieldKey>();
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
            <GenerationSetupOptionPicker
              isOpen={openField === key}
              onOpenChange={(open) =>
                setOpenField((current) =>
                  open ? key : current === key ? undefined : current,
                )
              }
              previewKind={key === 'style' || key === 'mood' ? key : undefined}
              label={GENERATION_SETUP_LOOK_FIELD_LABELS[key]}
              value={setup.values[key] ?? ''}
              onValueChange={(value) => {
                setOpenField(undefined);
                onSetField(key, value);
              }}
              options={options.map((option) => ({
                value: String(option.key),
                label: option.label,
                isPlatformDefault: option.isPlatformDefault,
                description: option.description,
                thumbnailUrl: option.thumbnailUrl,
              }))}
            />
          </GenerationSetupFieldRow>
        );
      })}
    </div>
  );
}
