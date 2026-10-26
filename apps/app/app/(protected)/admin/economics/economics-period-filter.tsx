'use client';

import type { EconomicsPeriodFilterProps } from '@props/admin/economics.props';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import { useTranslations } from 'next-intl';
import {
  DEFAULT_ECONOMICS_PERIOD_DAYS,
  ECONOMICS_PERIOD_DAYS,
} from './economics-report.util';

/** The reporting window, as the one facet of the shared Filters menu. */
export default function EconomicsPeriodFilter({
  onChange,
  value,
}: EconomicsPeriodFilterProps) {
  const translate = useTranslations('pages.adminEconomics');

  return (
    <FilterMenu
      facets={[
        {
          defaultValue: DEFAULT_ECONOMICS_PERIOD_DAYS,
          key: 'period',
          label: translate('periodLabel'),
          onChange,
          options: ECONOMICS_PERIOD_DAYS.map((days) => ({
            label: translate('period', { days }),
            value: String(days),
          })),
          selection: 'single',
          value,
        },
      ]}
      onClear={() => onChange(DEFAULT_ECONOMICS_PERIOD_DAYS)}
    />
  );
}
