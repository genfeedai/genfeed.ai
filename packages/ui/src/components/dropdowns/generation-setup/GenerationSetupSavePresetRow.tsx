'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { GenerationSetupSavePresetRowProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Save } from 'lucide-react';
import { useState } from 'react';

/** Footer row: a label field plus a Save button, disabled until a label is typed. */
export default function GenerationSetupSavePresetRow({
  isDisabled = false,
  onSavePreset,
}: GenerationSetupSavePresetRowProps) {
  const [label, setLabel] = useState('');

  const trimmedLabel = label.trim();

  function handleSave(): void {
    if (!trimmedLabel) {
      return;
    }
    onSavePreset(trimmedLabel);
    setLabel('');
  }

  return (
    <div className="flex items-center gap-2 border-t border-border pt-2">
      <Input
        isDisabled={isDisabled}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Save as preset…"
        value={label}
      />
      <Button
        icon={<Save className="size-3.5" />}
        isDisabled={isDisabled || !trimmedLabel}
        label="Save"
        onClick={handleSave}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
      />
    </div>
  );
}
