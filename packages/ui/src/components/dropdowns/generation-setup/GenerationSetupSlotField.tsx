'use client';

import type { GenerationSetupSlotFieldProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupMenuField from '@ui/dropdowns/generation-setup/GenerationSetupMenuField';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';

const SLOT_MAX_LENGTH = 400;

/**
 * Typing must not reach the menu: its typeahead would pull focus to the first
 * matching row. Arrow up/down, Enter and Escape still navigate.
 */
function keepTypingInField(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
    event.stopPropagation();
  }
}

/**
 * One free-text prompt slot (Subject, Action) as a Look row. The slot is sent
 * with the shot and stored with the prompt, so it describes this generation
 * only; it is never restored from a previous session.
 */
export default function GenerationSetupSlotField({
  label,
  onChange,
  placeholder,
  value,
}: GenerationSetupSlotFieldProps) {
  const translate = useTranslations('agent.generationSetup');

  return (
    <GenerationSetupMenuField label={label} value={value}>
      <Input
        aria-label={translate('slotFieldAria', { field: label })}
        className="h-9 w-64 rounded-none border-0 bg-transparent px-3 text-xs focus-visible:ring-0"
        maxLength={SLOT_MAX_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={keepTypingInField}
        placeholder={placeholder}
        value={value}
      />
    </GenerationSetupMenuField>
  );
}
