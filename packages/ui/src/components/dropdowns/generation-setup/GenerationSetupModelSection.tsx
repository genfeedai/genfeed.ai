'use client';

import { ModelLifecycle } from '@genfeedai/contracts';
import {
  formatCreditBalanceExact,
  formatCreditCost,
} from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { GenerationSetupModelSectionProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import type { ModelSelectorOption } from '@genfeedai/props/ui/model-selector/model-selector.props';
import GenerationSetupLegacyModelsMenu, {
  LEGACY_MODELS_ROW_VALUE,
} from '@ui/dropdowns/generation-setup/GenerationSetupLegacyModelsMenu';
import ModelSelectorModelItem from '@ui/dropdowns/model-selector/ModelSelectorModelItem';
import {
  AUTO_PRIORITY_LABELS,
  AUTO_PRIORITY_OPTIONS,
  isAutoGenerationModelKey,
} from '@ui/dropdowns/model-selector/model-selector.constants';
import {
  sortModelOptions,
  transformModelsToOptions,
} from '@ui/dropdowns/model-selector/model-selector.utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import { Check, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useState } from 'react';

/**
 * Model list: an Auto card (one row per {@link AUTO_PRIORITY_OPTIONS}) plus the
 * catalog as single-select rows, reusing `ModelSelectorModelItem` from the
 * model-selector dropdown so the two pickers never visually diverge.
 *
 * Retired rows are never listed. Legacy rows stay out of the catalog behind a
 * single "N legacy models" row that opens them in a flyout to the right; a
 * search narrows the flyout to the legacy models it matches.
 */
export default function GenerationSetupModelSection({
  capabilities,
  creditsAvailable,
  favoriteModelKeys,
  isDisabled = false,
  models,
  onFavoriteToggle,
  onSetField,
  setup,
}: GenerationSetupModelSectionProps) {
  const translate = useTranslations('agent.generationSetup');
  const [search, setSearch] = useState('');
  const [isLegacyOpen, setIsLegacyOpen] = useState(false);
  const [highlightedValue, setHighlightedValue] = useState('');
  const query = search.trim().toLowerCase();

  if (!capabilities.hasModelSelection) {
    return null;
  }

  const isAutoSelected = isAutoGenerationModelKey(setup.values.modelKey);
  const matchingOptions = sortModelOptions(
    transformModelsToOptions(
      models.filter((model) => model.lifecycle !== ModelLifecycle.RETIRED),
      favoriteModelKeys,
    ),
  ).filter((option) =>
    `${option.model.label} ${option.brandLabel} ${option.model.key} ${option.model.description ?? ''}`
      .toLowerCase()
      .includes(query),
  );
  const options = matchingOptions.filter((option) => !option.isDeprecated);
  const legacyOptions = matchingOptions.filter((option) => option.isDeprecated);
  const priorities = AUTO_PRIORITY_OPTIONS.filter((priority) =>
    `auto ${AUTO_PRIORITY_LABELS[priority]}`.toLowerCase().includes(query),
  );

  function isCreditLocked(cost: number | undefined): boolean {
    return (
      typeof creditsAvailable === 'number' &&
      typeof cost === 'number' &&
      cost > creditsAvailable
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (
      event.key !== 'ArrowRight' ||
      highlightedValue !== LEGACY_MODELS_ROW_VALUE
    )
      return;
    // In the search box the arrow still moves the caret until it is at the end.
    const { target } = event;
    if (
      target instanceof HTMLInputElement &&
      target.selectionStart !== target.value.length
    )
      return;
    event.preventDefault();
    setIsLegacyOpen(true);
  }

  function renderModelRow(option: ModelSelectorOption) {
    return (
      <ModelSelectorModelItem
        isLocked={isDisabled || isCreditLocked(option.model.cost)}
        isSelected={
          !isAutoSelected && setup.values.modelKey === option.model.key
        }
        key={option.model.key}
        lockReason={
          isCreditLocked(option.model.cost)
            ? `Needs ${formatCreditCost(option.model.cost)} credits (you have ${formatCreditBalanceExact(creditsAvailable)})`
            : undefined
        }
        onFavoriteToggle={onFavoriteToggle}
        onToggle={(modelKey) => {
          onSetField('modelKey', modelKey);
          setIsLegacyOpen(false);
        }}
        option={option}
        selectionMode="single"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Command
        label={translate('searchModels')}
        className="flex min-h-0 flex-col bg-transparent text-foreground"
        onKeyDown={handleKeyDown}
        // Controlled so cmdk reports the highlighted row, including the one it
        // picks on its own when the list changes.
        onValueChange={setHighlightedValue}
        shouldFilter={false}
        value={highlightedValue}
      >
        <CommandInput
          aria-label={translate('searchModels')}
          placeholder={translate('searchModelsPlaceholder')}
          value={search}
          onValueChange={(value) => {
            setSearch(value);
            setIsLegacyOpen(false);
          }}
        />
        <CommandList
          className={cn(
            'min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain px-0.5 py-0.5',
            'max-h-[min(280px,calc(var(--radix-popover-content-available-height,70vh)-8rem))]',
          )}
        >
          {priorities.length > 0 ? (
            <CommandGroup className="p-0.5" heading="Auto">
              {priorities.map((priorityOption) => {
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
                    onPointerDown={(event) => {
                      if (event.button !== 0) {
                        return;
                      }
                      event.preventDefault();
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
          ) : null}

          {options.length > 0 ? (
            <CommandGroup heading="Catalog">
              {options.map(renderModelRow)}
            </CommandGroup>
          ) : null}

          {legacyOptions.length > 0 ? (
            <CommandGroup>
              <GenerationSetupLegacyModelsMenu
                isOpen={isLegacyOpen}
                label={translate('legacyModels', {
                  count: legacyOptions.length,
                })}
                onOpenChange={setIsLegacyOpen}
              >
                {legacyOptions.map(renderModelRow)}
              </GenerationSetupLegacyModelsMenu>
            </CommandGroup>
          ) : null}

          {matchingOptions.length === 0 && priorities.length === 0 ? (
            <CommandEmpty>{translate('noModels')}</CommandEmpty>
          ) : null}
        </CommandList>
      </Command>
    </div>
  );
}
