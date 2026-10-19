'use client';

import { ComponentSize } from '@genfeedai/contracts';
import type { IFieldOption } from '@genfeedai/contracts/interfaces';
import type { IFilters } from '@genfeedai/contracts/interfaces/utils/filters.interface';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import type { FiltersBarProps } from '@genfeedai/props/ui/forms/filters.props';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import FormSearchbar from '@ui/primitives/searchbar';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import {
  DEFAULT_ACCOUNT_OPTIONS,
  DEFAULT_FAVORITE_OPTIONS,
  DEFAULT_FILTER_OPTIONS,
  DEFAULT_FORMAT_OPTIONS,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_PROVIDER_OPTIONS,
  DEFAULT_SORT_OPTIONS,
  DEFAULT_STATUS_OPTIONS,
  DEFAULT_TYPE_OPTIONS,
  DEFAULT_VISIBLE_FILTERS,
} from './filters-button-options.constants';

type FilterKey = Exclude<
  keyof NonNullable<FiltersBarProps['visibleFilters']>,
  'search'
>;

const EMPTY_FILTERS = {
  brand: '',
  category: '',
  favorite: '',
  format: '',
  model: '',
  provider: '',
  sort: '',
  status: [] as string[],
  type: '',
};

/** The "All …" entry is the absence of a filter, not a choice to list. */
function toChoices(options: readonly IFieldOption[]) {
  return options.filter((option) => option.value !== '');
}

export default function FiltersButton({
  filters,
  onFiltersChange,
  className = '',
  filterOptions = DEFAULT_FILTER_OPTIONS,
  visibleFilters = DEFAULT_VISIBLE_FILTERS,
}: FiltersBarProps) {
  const translate = useTranslations('ui.filtersButton');
  const notifyFilterChange = useCallback(
    (newFilters: typeof filters) => {
      const query: IFilters = {};
      Object.entries(newFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query[key as keyof IFilters] = value;
        }
      });
      onFiltersChange?.(newFilters, query);
    },
    [onFiltersChange],
  );

  const optionsByKey: Record<FilterKey, readonly IFieldOption[]> = {
    brand: filterOptions.brand || DEFAULT_ACCOUNT_OPTIONS,
    category: filterOptions.category || [],
    favorite: filterOptions.favorite || DEFAULT_FAVORITE_OPTIONS,
    format: filterOptions.format || DEFAULT_FORMAT_OPTIONS,
    model: filterOptions.model || DEFAULT_MODEL_OPTIONS,
    provider: filterOptions.provider || DEFAULT_PROVIDER_OPTIONS,
    sort: filterOptions.sort || DEFAULT_SORT_OPTIONS,
    status: filterOptions.status || DEFAULT_STATUS_OPTIONS,
    type: filterOptions.type || DEFAULT_TYPE_OPTIONS,
  };

  const facets: FilterMenuFacet[] = [];

  const statusValues =
    typeof filters.status === 'string'
      ? filters.status
        ? [filters.status]
        : []
      : filters.status || [];
  if (visibleFilters.status) {
    facets.push({
      key: 'status',
      label: translate('facets.status'),
      onChange: (values) => notifyFilterChange({ ...filters, status: values }),
      options: toChoices(optionsByKey.status),
      selection: 'multiple',
      values: statusValues,
    });
  }

  const singleKeys: Exclude<FilterKey, 'status'>[] = [
    'format',
    'type',
    'provider',
    'model',
    'sort',
    'favorite',
    'brand',
    'category',
  ];
  for (const key of singleKeys) {
    const options = toChoices(optionsByKey[key]);
    if (!visibleFilters[key] || options.length === 0) {
      continue;
    }
    facets.push({
      defaultValue: '',
      key,
      label: translate(`facets.${key}`),
      onChange: (value) => notifyFilterChange({ ...filters, [key]: value }),
      options,
      selection: 'single',
      value: filters[key] ?? '',
    });
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {visibleFilters.search ? (
        <FormSearchbar
          className="w-48"
          onSearch={(value) =>
            notifyFilterChange({ ...filters, search: value })
          }
          placeholder={translate('searchPlaceholder')}
          size={ComponentSize.SM}
          value={filters.search ?? ''}
        />
      ) : null}
      {facets.length > 0 ? (
        <FilterMenu
          allLabel={translate('all')}
          clearLabel={translate('clear')}
          facets={facets}
          getActiveCountLabel={(count) => translate('activeCount', { count })}
          label={translate('menu')}
          onClear={() => notifyFilterChange({ ...filters, ...EMPTY_FILTERS })}
        />
      ) : null}
    </div>
  );
}
