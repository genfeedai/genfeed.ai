'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { UnitEconomicsTableRow } from '@/features/admin/props/unit-economics.props';
import EconomicsPeriodFilter from '../economics-period-filter';
import { DEFAULT_ECONOMICS_PERIOD_DAYS } from '../economics-report.util';
import { useUnitEconomicsColumns } from './unit-economics-columns';
import { buildUnitEconomicsTableRows } from './unit-economics-report.util';
import {
  getUnitEconomicsRowId,
  useUnitEconomicsRowSidebar,
} from './unit-economics-row-sidebar';
import { useUnitEconomicsReport } from './use-unit-economics-report';

/** An organization's Spending tab; the totals and unattributed rows have none. */
function getSpendingHref(row: UnitEconomicsTableRow): string | undefined {
  return row.isTotal || !row.id
    ? undefined
    : `${APP_ROUTES.ADMIN.ORGANIZATIONS}/${row.id}/spending`;
}

export default function UnitEconomicsReport() {
  const translate = useTranslations('pages.unitEconomics');
  const [periodDays, setPeriodDays] = useState(DEFAULT_ECONOMICS_PERIOD_DAYS);

  const {
    data: report,
    error,
    isFetching,
    isLoading,
    onSortChange,
    refetch,
    resetPage,
    sortDirection,
    sortKey,
  } = useUnitEconomicsReport({ periodDays });

  const totalLabel = translate('total');
  const rows = useMemo(
    () => buildUnitEconomicsTableRows(report, totalLabel),
    [report, totalLabel],
  );
  const columns = useUnitEconomicsColumns(translate('columns.organization'));
  const rowSidebar = useUnitEconomicsRowSidebar({
    getOpenHref: getSpendingHref,
    kind: 'organization',
  });

  const handlePeriodChange = (days: string) => {
    setPeriodDays(days);
    resetPage();
  };

  return (
    <AdminPageShell
      title={translate('title')}
      icon={Scale}
      onRefresh={() => refetch()}
      isRefreshing={isFetching && !isLoading}
      filters={
        <EconomicsPeriodFilter
          onChange={handlePeriodChange}
          value={periodDays}
        />
      }
    >
      <AppTable<UnitEconomicsTableRow>
        ariaLabel={translate('tableLabel')}
        items={rows}
        isLoading={isLoading}
        columns={columns}
        getRowKey={getUnitEconomicsRowId}
        getRowClassName={(row) =>
          row.isTotal ? 'border-t-2 border-border bg-muted/40' : ''
        }
        getRowLink={(row) => {
          const href = getSpendingHref(row);
          return href
            ? {
                href,
                label: translate('openOrganization', { name: row.label }),
              }
            : undefined;
        }}
        rowSidebar={rowSidebar}
        emptyLabel={translate('empty')}
        error={
          error
            ? {
                description: error instanceof Error ? error.message : undefined,
                onRetry: () => refetch(),
                title: translate('loadFailed'),
              }
            : undefined
        }
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
      />
      <div className="mt-4">
        <AutoPagination showTotal totalLabel={translate('totalLabel')} />
      </div>
    </AdminPageShell>
  );
}
