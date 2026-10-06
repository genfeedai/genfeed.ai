'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationSetupPresetsSectionProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupSavePresetRow from '@ui/dropdowns/generation-setup/GenerationSetupSavePresetRow';
import { Button } from '@ui/primitives/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import { Check, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function GenerationSetupPresetsSection({
  isDisabled = false,
  isPresetsLoading,
  onApplyPreset,
  onDeletePreset,
  onSavePreset,
  presets,
  setup,
}: GenerationSetupPresetsSectionProps) {
  const translate = useTranslations('agent.generationSetup');
  const [search, setSearch] = useState('');
  const filteredPresets = presets.filter((preset) =>
    preset.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <Command
        className="bg-transparent"
        label={translate('searchPresets')}
        shouldFilter={false}
      >
        <CommandInput
          aria-label={translate('searchPresets')}
          placeholder={translate('searchPresetsPlaceholder')}
          value={search}
          onValueChange={setSearch}
        />
        <CommandList className="max-h-64">
          {isPresetsLoading ? (
            <span
              role="status"
              className="block p-2 text-xs text-muted-foreground"
            >
              {translate('loadingPresets')}
            </span>
          ) : null}
          {search.trim() &&
          filteredPresets.length === 0 &&
          !isPresetsLoading ? (
            <CommandEmpty>{translate('noMatches')}</CommandEmpty>
          ) : null}
          {filteredPresets.map((preset) => (
            <div className="group relative" key={preset.id}>
              <CommandItem
                aria-label={translate('applyPreset', { label: preset.label })}
                disabled={isDisabled || isPresetsLoading}
                value={preset.label}
                onSelect={() => onApplyPreset(preset)}
                className="min-h-8 gap-2 pr-9 text-xs"
              >
                <span className="min-w-0 flex-1 truncate">{preset.label}</span>
                {setup.presetId === preset.id ? (
                  <Check className="size-3.5 shrink-0" />
                ) : null}
              </CommandItem>
              {onDeletePreset ? (
                <Button
                  ariaLabel={translate('deletePreset', { label: preset.label })}
                  className="absolute right-1 top-1/2 size-6 -translate-y-1/2 p-0 text-muted-foreground hover:text-destructive"
                  icon={<Trash2 className="size-3.5" />}
                  isDisabled={isDisabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeletePreset(preset.id);
                  }}
                  size={ButtonSize.ICON}
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
              ) : null}
            </div>
          ))}
        </CommandList>
      </Command>
      <div>
        <GenerationSetupSavePresetRow
          isDisabled={isDisabled || isPresetsLoading}
          onSavePreset={onSavePreset}
        />
      </div>
    </div>
  );
}
