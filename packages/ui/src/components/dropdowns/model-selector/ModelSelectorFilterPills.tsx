'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  ModelSelectorFilter,
  ModelSelectorFilterPillsProps,
} from '@genfeedai/props/ui/model-selector/model-selector.props';
import { Button } from '@ui/primitives/button';
import { memo } from 'react';

/** One row, two axes: one category plus an optional capability shortcut. */
const ModelSelectorFilterPills = memo(function ModelSelectorFilterPills({
  categoryFilters,
  activeCategoryId,
  onCategorySelect,
  capabilityFilters,
  activeCapabilityFilterId,
  onCapabilityFilterSelect,
}: ModelSelectorFilterPillsProps) {
  if (categoryFilters.length < 2 && capabilityFilters.length === 0) {
    return null;
  }

  const renderFilter = (
    filter: ModelSelectorFilter,
    isActive: boolean,
    onSelect: () => void,
  ) => {
    const FilterIcon = filter.icon;

    return (
      <Button
        key={filter.id}
        ariaLabel={filter.label}
        aria-pressed={isActive}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={onSelect}
        className={cn(
          'flex min-h-6 shrink-0 items-center gap-1 rounded-full border px-2 py-0.5',
          'text-[11px] font-medium transition-colors',
          isActive
            ? 'border-transparent bg-accent text-accent-foreground'
            : 'border-border text-foreground/55 hover:bg-accent/70 hover:text-foreground',
        )}
      >
        {FilterIcon ? <FilterIcon className="size-3" aria-hidden /> : null}
        {filter.label}
      </Button>
    );
  };

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden',
        'border-b border-border bg-secondary px-1.5 py-1',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      <div
        role="group"
        aria-label="Model categories"
        className="flex shrink-0 items-center gap-1"
      >
        {categoryFilters.map((filter) =>
          renderFilter(filter, filter.id === activeCategoryId, () =>
            onCategorySelect(filter.id),
          ),
        )}
      </div>

      {capabilityFilters.length > 0 ? (
        <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
      ) : null}

      {capabilityFilters.length > 0 ? (
        <div
          role="group"
          aria-label="Model capabilities"
          className="flex shrink-0 items-center gap-1"
        >
          {capabilityFilters.map((filter) =>
            renderFilter(filter, filter.id === activeCapabilityFilterId, () =>
              onCapabilityFilterSelect(filter.id),
            ),
          )}
        </div>
      ) : null}
    </div>
  );
});

export default ModelSelectorFilterPills;
