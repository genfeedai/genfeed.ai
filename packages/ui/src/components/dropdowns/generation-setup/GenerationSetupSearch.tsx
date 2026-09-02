'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  GenerationSetupSearchOption,
  GenerationSetupSearchProps,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import {
  GENERATION_SETUP_ASPECT_RATIO_OPTIONS,
  GENERATION_SETUP_DURATION_OPTIONS_SECONDS,
  GENERATION_SETUP_LOOK_FIELD_LABELS,
  GENERATION_SETUP_LOOK_FIELD_ORDER,
  GENERATION_SETUP_OUTPUTS_OPTIONS,
} from '@ui/dropdowns/generation-setup/generation-setup.constants';
import { AUTO_PRIORITY_LABELS } from '@ui/dropdowns/model-selector/model-selector.constants';
import { Button } from '@ui/primitives/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

/**
 * Layer 2 of the popover: a flat cmdk index across every field (type, model,
 * ratio, outputs, look options, brand toggles). Selecting a row sets that
 * field (source `user`) and returns to the front door.
 */
export default function GenerationSetupSearch({
  capabilities,
  lookOptions,
  models,
  onBack,
  onSetField,
  setup,
  typeOptions,
}: GenerationSetupSearchProps) {
  const translate = useTranslations('agent.generationSetup');
  const options = useMemo<GenerationSetupSearchOption[]>(() => {
    const index: GenerationSetupSearchOption[] = [];

    for (const typeOption of typeOptions) {
      index.push({
        fieldKey: 'type',
        group: 'Type',
        label: typeOption.label,
        value: typeOption.value,
      });
    }

    if (capabilities.hasModelSelection) {
      index.push({
        fieldKey: 'modelKey',
        group: 'Model',
        keywords: ['auto', 'automatic'],
        label: 'Auto',
        value: '',
      });
      for (const model of models) {
        index.push({
          fieldKey: 'modelKey',
          group: 'Model',
          label: model.label,
          value: model.key,
        });
      }
      for (const priorityOption of Object.keys(
        AUTO_PRIORITY_LABELS,
      ) as (keyof typeof AUTO_PRIORITY_LABELS)[]) {
        index.push({
          fieldKey: 'prioritize',
          group: 'Model priority',
          label: AUTO_PRIORITY_LABELS[priorityOption],
          value: priorityOption,
        });
      }
    }

    if (capabilities.hasAspectRatio) {
      for (const ratio of GENERATION_SETUP_ASPECT_RATIO_OPTIONS) {
        index.push({
          fieldKey: 'aspectRatio',
          group: 'Aspect ratio',
          label: ratio,
          value: ratio,
        });
      }
    }

    if (capabilities.hasDuration) {
      for (const seconds of GENERATION_SETUP_DURATION_OPTIONS_SECONDS) {
        index.push({
          fieldKey: 'duration',
          group: 'Duration',
          label: `${seconds}s`,
          value: seconds,
        });
      }
    }

    if (capabilities.hasOutputs) {
      for (const count of GENERATION_SETUP_OUTPUTS_OPTIONS) {
        index.push({
          fieldKey: 'outputs',
          group: 'Outputs',
          label: `${count} output${count === 1 ? '' : 's'}`,
          value: count,
        });
      }
    }

    for (const key of GENERATION_SETUP_LOOK_FIELD_ORDER) {
      const fieldOptions = lookOptions[key] ?? [];
      for (const option of fieldOptions) {
        index.push({
          fieldKey: key,
          group: GENERATION_SETUP_LOOK_FIELD_LABELS[key],
          label: option.label,
          value: String(option.key),
        });
      }
    }

    index.push(
      {
        fieldKey: 'brandingMode',
        group: 'Brand voice',
        label: 'Brand voice on',
        value: 'brand',
      },
      {
        fieldKey: 'brandingMode',
        group: 'Brand voice',
        label: 'Brand voice off',
        value: 'off',
      },
      {
        fieldKey: 'isPromptEnhanceEnabled',
        group: 'Prompt enhance',
        label: 'Prompt enhance on',
        value: true,
      },
      {
        fieldKey: 'isPromptEnhanceEnabled',
        group: 'Prompt enhance',
        label: 'Prompt enhance off',
        value: false,
      },
    );

    return index;
  }, [capabilities, lookOptions, models, typeOptions]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, GenerationSetupSearchOption[]>();
    for (const option of options) {
      const existing = byGroup.get(option.group) ?? [];
      existing.push(option);
      byGroup.set(option.group, existing);
    }
    return Array.from(byGroup.entries());
  }, [options]);

  function handleSelect(option: GenerationSetupSearchOption): void {
    onSetField(option.fieldKey, option.value);
    onBack();
  }

  return (
    <Command
      className="flex min-h-0 flex-col bg-transparent text-foreground"
      loop
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-1.5 py-1.5">
        <Button
          ariaLabel="Back to setup"
          className="size-7 shrink-0 p-0"
          icon={<ArrowLeft className="size-3.5" />}
          onClick={onBack}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
        />
        <CommandInput
          className="h-8 flex-1 border-0 bg-transparent px-1 text-foreground"
          placeholder="Search model, ratio, look, brand…"
        />
      </div>

      <CommandList className="max-h-[min(360px,var(--radix-popover-content-available-height,70vh))] min-h-0 overflow-y-auto px-1 py-1">
        {groups.map(([group, groupOptions]) => (
          <CommandGroup heading={group} key={group}>
            {groupOptions.map((option, index) => {
              const isSelected = setup.values[option.fieldKey] === option.value;

              return (
                <CommandItem
                  className="flex min-h-7 cursor-pointer items-center justify-between gap-2 rounded-sm px-1.5 py-0.5 text-xs text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                  key={`${option.fieldKey}-${String(option.value)}-${index}`}
                  keywords={option.keywords}
                  onSelect={() => handleSelect(option)}
                  value={`${option.group} ${option.label}`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected ? (
                    <span className="text-2xs text-muted-foreground">
                      {translate('current')}
                    </span>
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}

        <CommandEmpty>{translate('noMatchingFields')}</CommandEmpty>
      </CommandList>
    </Command>
  );
}
