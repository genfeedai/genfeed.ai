'use client';

import { ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { FiltersBarProps } from '@genfeedai/props/ui/forms/filters.props';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import FormSearchbar from '@ui/primitives/searchbar';
import { useTranslations } from 'next-intl';

/**
 * The search of a filtered list, with its Filters menu attached inside the
 * field's trailing edge: one control for finding and narrowing, so the subbar
 * carries no separate filter trigger or applied-filter chips. It writes
 * `filters.search`, so the page's query mapping stays the one the Filters menu
 * already uses.
 */
export default function FiltersSearch({
  className,
  filterOptions,
  filters,
  onFiltersChange,
  visibleFilters,
}: FiltersBarProps) {
  const translate = useTranslations('ui.filtersButton');

  return (
    <div className={cn('relative w-80 max-w-full min-w-0', className)}>
      <FormSearchbar
        className="w-full"
        inputClassName="pr-24"
        onSearch={(value) => {
          const next = { ...filters, search: value };
          const query = Object.fromEntries(
            Object.entries(next).filter(
              ([, entry]) => entry !== undefined && entry !== null,
            ),
          );
          onFiltersChange(next, query);
        }}
        placeholder={translate('searchPlaceholder')}
        showClearButton={false}
        size={ComponentSize.SM}
        value={filters.search ?? ''}
      />
      <div className="absolute right-1 top-1/2 z-20 -translate-y-1/2">
        <FiltersButton
          filterOptions={filterOptions}
          filters={filters}
          isAttached
          onFiltersChange={onFiltersChange}
          visibleFilters={visibleFilters}
        />
      </div>
    </div>
  );
}
