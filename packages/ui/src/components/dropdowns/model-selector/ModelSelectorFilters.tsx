'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  ModelSelectorFilter,
  ModelSelectorFiltersProps,
} from '@genfeedai/props/ui/model-selector/model-selector.props';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

/** One row of filters, two axes: one category plus an optional capability shortcut. */
const ModelSelectorFilters = memo(function ModelSelectorFilters({
  categoryFilters,
  activeCategoryId,
  onCategorySelect,
  capabilityFilters,
  activeCapabilityFilterId,
  onCapabilityFilterSelect,
}: ModelSelectorFiltersProps) {
  const translate = useTranslations('ui.modelSelectorFilters');
  if (categoryFilters.length < 2 && capabilityFilters.length === 0) {
    return null;
  }

  const renderTiles = (filters: ModelSelectorFilter[]) =>
    filters.map((filter) => {
      const FilterIcon = filter.icon;

      return (
        <OptionTile
          ariaLabel={filter.label}
          className="w-auto"
          icon={FilterIcon ? <FilterIcon aria-hidden /> : undefined}
          key={filter.id}
          size="sm"
          title={filter.label}
          value={filter.id}
        />
      );
    });

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden',
        'border-b border-border bg-muted px-1.5 py-1',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      <OptionTileGroup
        ariaLabel={translate('categories')}
        className="shrink-0 flex-nowrap"
        onValueChange={onCategorySelect}
        value={activeCategoryId}
      >
        {renderTiles(categoryFilters)}
      </OptionTileGroup>

      {capabilityFilters.length > 0 ? (
        <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
      ) : null}

      {capabilityFilters.length > 0 ? (
        <OptionTileGroup
          ariaLabel={translate('capabilities')}
          className="shrink-0 flex-nowrap"
          isDeselectable
          onValueChange={(filterId) => {
            const nextId = filterId ?? activeCapabilityFilterId;
            if (nextId) {
              onCapabilityFilterSelect(nextId);
            }
          }}
          value={activeCapabilityFilterId ?? undefined}
        >
          {renderTiles(capabilityFilters)}
        </OptionTileGroup>
      ) : null}
    </div>
  );
});

export default ModelSelectorFilters;
