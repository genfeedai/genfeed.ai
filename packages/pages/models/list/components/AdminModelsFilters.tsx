'use client';

import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getModelProviderLabel } from '@genfeedai/helpers/ui/model-badge.helper';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import {
  type AdminModelsFiltersProps,
  resolveAdminModelFilters,
} from '@props/admin/models.props';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function AdminModelsFilters({
  category,
}: AdminModelsFiltersProps) {
  const translate = useTranslations('pages.models');
  const params = useSearchParams();
  const { replace } = useRouter();
  const filters = resolveAdminModelFilters(
    new URLSearchParams(params.toString()),
    category,
  );
  function handleChange(name: string, values: string[]) {
    const next = new URLSearchParams(params.toString());
    // Materialize legacy type links before switching to independent filters.
    next.delete('type');
    next.delete('category');
    next.delete('provider');
    next.delete('status');
    for (const [key, selected] of Object.entries({
      category: filters.categories,
      provider: filters.providers,
      status: filters.statuses,
    })) {
      const entries = name === 'clear' ? [] : key === name ? values : selected;
      if (key === 'status' && entries.length === 0) next.set('status', 'all');
      else for (const value of entries) next.append(key, value);
    }
    next.delete('page');
    replace(`${APP_ROUTES.ADMIN.AUTOMATION.MODELS}?${next.toString()}`, {
      scroll: false,
    });
  }
  const facets: FilterMenuFacet[] = [
    {
      key: 'category',
      label: translate('filterCategories'),
      onChange: (values) => handleChange('category', values),
      options: Object.values(ModelCategory).map((value) => ({
        label: value
          .replaceAll('-', ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
        value,
      })),
      selection: 'multiple',
      values: filters.categories,
    },
    {
      key: 'provider',
      label: translate('filterProviders'),
      onChange: (values) => handleChange('provider', values),
      options: Object.values(ModelProvider).map((value) => ({
        label: getModelProviderLabel(value),
        value,
      })),
      selection: 'multiple',
      values: filters.providers,
    },
    {
      key: 'status',
      label: translate('filterStatus'),
      onChange: (values) => handleChange('status', values),
      options: [
        { label: translate('active'), value: 'active' },
        { label: translate('inactive'), value: 'inactive' },
      ],
      selection: 'multiple',
      values: filters.statuses,
    },
  ];

  return (
    <FilterMenu
      clearLabel={translate('clearFilters')}
      facets={facets}
      getActiveCountLabel={(count) => translate('activeFilterCount', { count })}
      label={translate('filters')}
      onClear={() => handleChange('clear', [])}
    />
  );
}
