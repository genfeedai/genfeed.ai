'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { GenerationSetupModelSectionProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupProvenanceDot from '@ui/dropdowns/generation-setup/GenerationSetupProvenanceDot';
import ModelSelectorModelItem from '@ui/dropdowns/model-selector/ModelSelectorModelItem';
import {
  AUTO_PRIORITY_LABELS,
  AUTO_PRIORITY_OPTIONS,
} from '@ui/dropdowns/model-selector/model-selector.constants';
import {
  sortModelOptions,
  transformModelsToOptions,
} from '@ui/dropdowns/model-selector/model-selector.utils';
import { Button } from '@ui/primitives/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import { Check, Sparkles, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Model tab: an Auto card (one row per {@link AUTO_PRIORITY_OPTIONS}) plus the
 * full catalog as single-select rows, reusing `ModelSelectorModelItem` from
 * the model-selector dropdown so the two pickers never visually diverge.
 */
export default function GenerationSetupModelSection({
  capabilities,
  creditQuoteLabel,
  creditsAvailable,
  favoriteModelKeys,
  isDisabled = false,
  models,
  onFavoriteToggle,
  onResetField,
  onSetField,
  reasons,
  setup,
}: GenerationSetupModelSectionProps) {
  const translate = useTranslations('agent.generationSetup');

  if (!capabilities.hasModelSelection) {
    return null;
  }

  const isAutoSelected = setup.values.modelKey === '';
  const options = sortModelOptions(
    transformModelsToOptions(models, favoriteModelKeys),
  );

  function isCreditLocked(cost: number | undefined): boolean {
    return (
      typeof creditsAvailable === 'number' &&
      typeof cost === 'number' &&
      cost > creditsAvailable
    );
  }

  const source = setup.sources.modelKey ?? 'agent';
  const canReset = source !== 'agent';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GenerationSetupProvenanceDot
            reason={reasons.modelKey ?? reasons.prioritize}
            source={source}
          />
          {translate('model')}
        </span>
        <div className="flex items-center gap-2">
          {creditQuoteLabel ? (
            <span className="text-2xs text-muted-foreground">
              {creditQuoteLabel}
            </span>
          ) : null}
          {canReset ? (
            <Button
              ariaLabel="Reset model to agent"
              className="size-6 p-0 text-muted-foreground [&_svg]:size-3"
              icon={<Undo2 />}
              onClick={() => onResetField('modelKey')}
              size={ButtonSize.ICON}
              variant={ButtonVariant.GHOST}
            />
          ) : null}
        </div>
      </div>

      <Command
        className="flex min-h-0 flex-col bg-transparent text-foreground"
        shouldFilter={false}
      >
        <CommandList
          className={cn(
            'min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain px-0.5 py-0.5',
            'max-h-[min(280px,calc(var(--radix-popover-content-available-height,70vh)-8rem))]',
          )}
        >
          <CommandGroup className="p-0.5" heading="Auto">
            {AUTO_PRIORITY_OPTIONS.map((priorityOption) => {
              const isRowSelected =
                isAutoSelected && setup.values.prioritize === priorityOption;

              return (
                <CommandItem
                  className={cn(
                    'flex min-h-7 cursor-pointer items-center gap-2 rounded-sm px-1.5 py-0.5 text-xs text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                    isRowSelected && 'bg-background-tertiary',
                  )}
                  disabled={isDisabled}
                  key={priorityOption}
                  onSelect={() => {
                    onSetField('modelKey', '');
                    onSetField('prioritize', priorityOption);
                  }}
                  value={`auto ${AUTO_PRIORITY_LABELS[priorityOption]}`}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded border border-border bg-primary/10 text-primary">
                    <Sparkles className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {AUTO_PRIORITY_LABELS[priorityOption]}
                  </span>
                  {isRowSelected ? (
                    <Check className="size-3.5 shrink-0 text-foreground" />
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandGroup heading="Catalog">
            {options.map((option) => (
              <ModelSelectorModelItem
                isLocked={isDisabled || isCreditLocked(option.model.cost)}
                isSelected={
                  !isAutoSelected && setup.values.modelKey === option.model.key
                }
                key={option.model.key}
                lockReason={
                  isCreditLocked(option.model.cost)
                    ? `Needs ${option.model.cost} credits (you have ${creditsAvailable})`
                    : undefined
                }
                onFavoriteToggle={onFavoriteToggle}
                onToggle={(modelKey) => onSetField('modelKey', modelKey)}
                option={option}
                selectionMode="single"
              />
            ))}
          </CommandGroup>

          {options.length === 0 ? (
            <CommandEmpty>{translate('noModels')}</CommandEmpty>
          ) : null}
        </CommandList>
      </Command>
    </div>
  );
}
