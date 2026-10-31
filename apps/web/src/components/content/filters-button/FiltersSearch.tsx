'use client';

import { useTranslations } from 'next-intl';
import FiltersButton from '@/components/content/filters-button/FiltersButton';
import SearchField from '@/components/content/search-field/SearchField';
import type { FiltersBarProps } from '@/props/ui/forms/filters.props';

/**
 * The search of a filtered list with its Filters menu attached inside the
 * field. It writes `filters.search`, so the page's query mapping stays the one
 * the Filters menu already uses.
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
    <SearchField
      className={className}
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
      value={filters.search ?? ''}
    >
      <FiltersButton
        filterOptions={filterOptions}
        filters={filters}
        isAttached
        onFiltersChange={onFiltersChange}
        visibleFilters={visibleFilters}
      />
    </SearchField>
  );
}
