'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModelSelectorFilterPillsProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import { Button } from '@ui/primitives/button';
import { memo } from 'react';

/**
 * The picker's only structural filter — one active pill at a time. It replaces
 * the provider rail and the source tab strip, so the list itself never nests.
 */
const ModelSelectorFilterPills = memo(function ModelSelectorFilterPills({
  filters,
  activeFilterId,
  onFilterSelect,
}: ModelSelectorFilterPillsProps) {
  if (filters.length < 2) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label="Filter models"
      className={cn(
        'flex shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden',
        'border-b border-border bg-secondary px-1.5 py-1',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      {filters.map((filter) => {
        const FilterIcon = filter.icon;
        const isActive = filter.id === activeFilterId;

        return (
          <Button
            key={filter.id}
            ariaLabel={filter.label}
            aria-pressed={isActive}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => onFilterSelect(filter.id)}
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
      })}
    </div>
  );
});

export default ModelSelectorFilterPills;
