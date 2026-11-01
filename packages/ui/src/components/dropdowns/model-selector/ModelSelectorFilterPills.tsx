'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  ModelSelectorFilter,
  ModelSelectorFilterPillsProps,
} from '@genfeedai/props/ui/model-selector/model-selector.props';
import { SegmentedControl } from '@ui/primitives/segmented-control';
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

  const toOptions = (filters: ModelSelectorFilter[]) =>
    filters.map((filter) => {
      const FilterIcon = filter.icon;

      return {
        ariaLabel: filter.label,
        icon: FilterIcon ? <FilterIcon aria-hidden /> : undefined,
        label: filter.label,
        value: filter.id,
      };
    });

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden',
        'border-b border-border bg-muted px-1.5 py-1',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      <SegmentedControl
        appearance="chip"
        ariaLabel="Model categories"
        className="shrink-0 flex-nowrap"
        onValueChange={onCategorySelect}
        options={toOptions(categoryFilters)}
        size="sm"
        value={activeCategoryId}
      />

      {capabilityFilters.length > 0 ? (
        <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
      ) : null}

      {capabilityFilters.length > 0 ? (
        <SegmentedControl
          appearance="chip"
          ariaLabel="Model capabilities"
          className="shrink-0 flex-nowrap"
          isDeselectable
          onValueChange={(filterId) => {
            const nextId = filterId ?? activeCapabilityFilterId;
            if (nextId) {
              onCapabilityFilterSelect(nextId);
            }
          }}
          options={toOptions(capabilityFilters)}
          size="sm"
          value={activeCapabilityFilterId ?? undefined}
        />
      ) : null}
    </div>
  );
});

export default ModelSelectorFilterPills;
