'use client';

import type { AnalyticsFilterMenuProps } from '@genfeedai/props/analytics/analytics-filter-menu.props';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import { useTranslations } from 'next-intl';

/**
 * The one filter control every analytics page publishes into the subbar, so
 * platform, tier and type filters look and behave the same everywhere.
 */
export default function AnalyticsFilterMenu({
  facets,
  onClear,
}: AnalyticsFilterMenuProps) {
  const translate = useTranslations('ui.filtersButton');

  return (
    <FilterMenu
      allLabel={translate('all')}
      clearLabel={translate('clear')}
      facets={facets}
      getActiveCountLabel={(count) => translate('activeCount', { count })}
      label={translate('menu')}
      onClear={onClear}
    />
  );
}
