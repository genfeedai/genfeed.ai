'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { formatCreditCost } from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  UnitEconomicsDrillDown,
  UnitEconomicsSortKey,
  UnitEconomicsTableRow,
} from '@props/admin/unit-economics.props';
import type {
  TableColumn,
  TableSortDirection,
} from '@props/ui/display/table.props';
import { AdminUnitEconomicsService } from '@services/admin/unit-economics.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ArrowLeft, Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  buildUnitEconomicsRange,
  buildUnitEconomicsTableRows,
  formatMarginPercent,
  formatUsd,
  UNIT_ECONOMICS_PERIOD_DAYS,
} from './unit-economics-report.util';

const DEFAULT_PERIOD_DAYS = '30';

function isUnitEconomicsSortKey(key: string): key is UnitEconomicsSortKey {
  return [
    'agentChatCredits',
    'agentTurns',
    'generationCredits',
    'grossMarginPercent',
    'grossMarginUsd',
    'label',
    'llmProviderCostUsd',
    'mediaProviderCostUsd',
    'revenueUsd',
  ].includes(key);
}

export default function UnitEconomicsReport() {
  const translate = useTranslations('pages.unitEconomics');
  const [periodDays, setPeriodDays] = useState(DEFAULT_PERIOD_DAYS);
  const [drillDown, setDrillDown] = useState<UnitEconomicsDrillDown | null>(
    null,
  );
  const [sortKey, setSortKey] =
    useState<UnitEconomicsSortKey>('llmProviderCostUsd');
  const [sortDirection, setSortDirection] =
    useState<TableSortDirection>('desc');

  const getUnitEconomicsService = useAuthedService((token: string) =>
    AdminUnitEconomicsService.getInstance(token),
  );
  const range = useMemo(
    () => buildUnitEconomicsRange(Number(periodDays)),
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
    ],
  });

  useEffect(() => {
    if (error) {
      logger.error('GET /admin/unit-economics failed', error);
    }
  }, [error]);

  const totalLabel = translate('total');
  const rows = useMemo(
    () =>
      buildUnitEconomicsTableRows(report, sortKey, sortDirection, totalLabel),
    [report, sortDirection, sortKey, totalLabel],
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
      render: (row) => numberCell(formatCreditCost(row.agentChatCredits), row),
      sortable: true,
    },
    {
      header: translate('columns.generationCredits'),
      key: 'generationCredits',
      render: (row) => numberCell(formatCreditCost(row.generationCredits), row),
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
  };

  return (
    <Container
      label={
        drillDown
          ? translate('titleDrillDown', { label: drillDown.label })
          : translate('title')
      }
      description={
        drillDown
          ? translate('descriptionDrillDown')
          : translate('description')
      }
      icon={Scale}
      right={
        <div className="flex items-center gap-2">
          {drillDown ? (
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={() => setDrillDown(null)}
            >
              <ArrowLeft className="size-4" />
              {translate('allOrganizations')}
            </Button>
          ) : null}
          <Select value={periodDays} onValueChange={setPeriodDays}>
            <SelectTrigger className="w-40" aria-label={translate('periodLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNIT_ECONOMICS_PERIOD_DAYS.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {translate('period', { days })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ButtonRefresh
            onClick={() => refetch()}
            isRefreshing={isFetching && !isLoading}
          />
        </div>
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
                  setDrillDown({ id: row.id, label: row.label });
                }
              }
        }
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
      />
    </Container>
  );
}
