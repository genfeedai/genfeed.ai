'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  formatCreditCost,
  ITEMS_PER_PAGE,
  UNIT_ECONOMICS_SORT_KEYS,
  type UnitEconomicsSortKey,
} from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  UnitEconomicsDrillDown,
  UnitEconomicsTableRow,
} from '@props/admin/unit-economics.props';
import type {
  TableColumn,
  TableSortDirection,
} from '@props/ui/display/table.props';
import { AdminUnitEconomicsService } from '@services/admin/unit-economics.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ArrowLeft, Scale } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildEconomicsRange,
  DEFAULT_ECONOMICS_PERIOD_DAYS,
  ECONOMICS_PERIOD_DAYS,
  formatMarginPercent,
  formatUsd,
} from '../economics-report.util';
import { buildUnitEconomicsTableRows } from './unit-economics-report.util';

/** A report column has no free credits: zero spend is a dash, not "Free". */
function formatCredits(credits: number): string {
  return credits === 0 ? '—' : formatCreditCost(credits);
}

function isUnitEconomicsSortKey(key: string): key is UnitEconomicsSortKey {
  return (UNIT_ECONOMICS_SORT_KEYS as readonly string[]).includes(key);
}

export default function UnitEconomicsReport() {
  const translate = useTranslations('pages.unitEconomics');
  const [periodDays, setPeriodDays] = useState(DEFAULT_ECONOMICS_PERIOD_DAYS);
  const [drillDown, setDrillDown] = useState<UnitEconomicsDrillDown | null>(
    null,
  );
  const [sortKey, setSortKey] =
    useState<UnitEconomicsSortKey>('llmProviderCostUsd');
  const [sortDirection, setSortDirection] =
    useState<TableSortDirection>('desc');

  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const currentPage = Number(searchParams.get('page')) || 1;

  // Changing what the report is sorted or filtered by starts over at page 1.
  const resetPage = useCallback(() => {
    const next = new URLSearchParams(searchParamsString);
    if (!next.has('page')) {
      return;
    }
    next.delete('page');
    const query = next.toString();
    replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, replace, searchParamsString]);

  const getUnitEconomicsService = useAuthedService((token: string) =>
    AdminUnitEconomicsService.getInstance(token),
  );
  const range = useMemo(
    () => buildEconomicsRange(Number(periodDays)),
    [periodDays],
  );

  const {
    data: report,
    error,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryFn: async ({ signal }) => {
      const service = await getUnitEconomicsService();
      return service.getReport(
        {
          from: range.from,
          limit: ITEMS_PER_PAGE,
          page: currentPage,
          sortDirection,
          sortKey,
          to: range.to,
          ...(drillDown ? { organizationId: drillDown.id } : {}),
        },
        signal,
      );
    },
    queryKey: [
      'admin-unit-economics',
      range.from,
      range.to,
      drillDown?.id ?? 'organizations',
      currentPage,
      sortKey,
      sortDirection,
    ],
  });

  useEffect(() => {
    if (error) {
      logger.error('GET /admin/unit-economics failed', error);
    }
  }, [error]);

  const totalLabel = translate('total');
  const rows = useMemo(
    () => buildUnitEconomicsTableRows(report, totalLabel),
    [report, totalLabel],
  );

  const numberCell = (value: string, row: UnitEconomicsTableRow) => (
    <span className={cn('tabular-nums', row.isTotal && 'font-semibold')}>
      {value}
    </span>
  );

  const columns: TableColumn<UnitEconomicsTableRow>[] = [
    {
      header: drillDown
        ? translate('columns.user')
        : translate('columns.organization'),
      key: 'label',
      render: (row) => (
        <span className={cn(row.isTotal && 'font-semibold')}>{row.label}</span>
      ),
      sortable: true,
    },
    {
      header: translate('columns.revenue'),
      key: 'revenueUsd',
      render: (row) => numberCell(formatUsd(row.revenueUsd), row),
      sortable: true,
    },
    {
      header: translate('columns.agentChatCredits'),
      key: 'agentChatCredits',
      render: (row) => numberCell(formatCredits(row.agentChatCredits), row),
      sortable: true,
    },
    {
      header: translate('columns.generationCredits'),
      key: 'generationCredits',
      render: (row) => numberCell(formatCredits(row.generationCredits), row),
      sortable: true,
      sortLabel: translate('columns.generationCreditsSort'),
    },
    {
      header: translate('columns.llmCost'),
      key: 'llmProviderCostUsd',
      render: (row) => numberCell(formatUsd(row.llmProviderCostUsd), row),
      sortable: true,
    },
    {
      header: translate('columns.generationCost'),
      key: 'mediaProviderCostUsd',
      render: (row) => numberCell(formatUsd(row.mediaProviderCostUsd), row),
      sortable: true,
    },
    {
      header: translate('columns.grossMargin'),
      key: 'grossMarginUsd',
      render: (row) => (
        <span
          className={cn(
            'tabular-nums',
            row.isTotal && 'font-semibold',
            row.grossMarginUsd < 0 && 'text-destructive',
          )}
        >
          {formatUsd(row.grossMarginUsd)}
        </span>
      ),
      sortable: true,
    },
    {
      header: translate('columns.marginPercent'),
      key: 'grossMarginPercent',
      render: (row) =>
        numberCell(formatMarginPercent(row.grossMarginPercent), row),
      sortable: true,
    },
    {
      header: translate('columns.agentTurns'),
      key: 'agentTurns',
      render: (row) => numberCell(row.agentTurns.toLocaleString('en-US'), row),
      sortable: true,
    },
    {
      header: translate('columns.topModels'),
      key: 'topModels',
      render: (row) =>
        row.topModels.length === 0 ? (
          '—'
        ) : (
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {row.topModels.map((model) => (
              <span key={model.model} className="whitespace-nowrap">
                {model.model}{' '}
                <span className="tabular-nums">
                  {formatUsd(model.providerCostUsd)}
                </span>
              </span>
            ))}
          </div>
        ),
    },
  ];

  const handleSortChange = (key: string, direction: TableSortDirection) => {
    if (!isUnitEconomicsSortKey(key)) {
      return;
    }
    setSortKey(key);
    setSortDirection(direction);
    resetPage();
  };

  const handlePeriodChange = (days: string) => {
    setPeriodDays(days);
    resetPage();
  };

  const handleDrillDown = (next: UnitEconomicsDrillDown | null) => {
    setDrillDown(next);
    resetPage();
  };

  return (
    <AdminPageShell
      title={
        drillDown
          ? translate('titleDrillDown', { label: drillDown.label })
          : translate('title')
      }
      icon={Scale}
      onRefresh={() => refetch()}
      isRefreshing={isFetching && !isLoading}
      dropdowns={
        <Select value={periodDays} onValueChange={handlePeriodChange}>
          <SelectTrigger className="w-40" aria-label={translate('periodLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ECONOMICS_PERIOD_DAYS.map((days) => (
              <SelectItem key={days} value={String(days)}>
                {translate('period', { days })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      filters={
        drillDown ? (
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={() => handleDrillDown(null)}
          >
            <ArrowLeft className="size-4" />
            {translate('allOrganizations')}
          </Button>
        ) : undefined
      }
    >
      <AppTable<UnitEconomicsTableRow>
        ariaLabel={translate('tableLabel')}
        items={rows}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(row) => row.id || 'unattributed'}
        getRowClassName={(row) =>
          row.isTotal ? 'border-t-2 border-border bg-muted/40' : ''
        }
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
        onRowClick={
          drillDown
            ? undefined
            : (row) => {
                if (!row.isTotal && row.id) {
                  handleDrillDown({ id: row.id, label: row.label });
                }
              }
        }
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
      />
      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel={
            drillDown ? translate('totalLabelUsers') : translate('totalLabel')
          }
        />
      </div>
    </AdminPageShell>
  );
}
