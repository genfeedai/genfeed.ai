'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { WorkflowCostReportExecution } from '@genfeedai/contracts/interfaces';
import type {
  ICostReportBrandTotals,
  ICostReportEntry,
  ICostReportQuery,
} from '@genfeedai/contracts/interfaces/billing';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { CostsService } from '@services/billing/costs.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import AppTable from '@ui/display/table/Table';
import { Button } from '@ui/primitives/button';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Text } from '@ui/typography/text';
import { Download, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

const ALL_BRANDS_VALUE = '__all_brands__';
const DEFAULT_RANGE_DAYS = 30;

interface CostUsagePageProps {
  lockedBrandId?: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    currency: 'USD',
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value);
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

function buildDateQuery(days: number): Pick<ICostReportQuery, 'from' | 'to'> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function downloadCsv(data: ArrayBuffer): void {
  const url = window.URL.createObjectURL(
    new Blob([data], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'generation-costs.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function CostUsagePage({ lockedBrandId }: CostUsagePageProps) {
  const translate = useTranslations('pages.costUsage');
  const { brands, isReady, organizationId, selectedBrand } = useBrand();
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [rangeDays, setRangeDays] = useState(DEFAULT_RANGE_DAYS);
  const [isExporting, setIsExporting] = useState(false);
  const effectiveBrandId = lockedBrandId ?? selectedBrandId;
  const dateQuery = useMemo(() => buildDateQuery(rangeDays), [rangeDays]);
  const reportQuery = useMemo<ICostReportQuery>(
    () => ({
      ...dateQuery,
      ...(effectiveBrandId ? { brandId: effectiveBrandId } : {}),
    }),
    [dateQuery, effectiveBrandId],
  );
  const lockedBrand =
    selectedBrand?.id === lockedBrandId
      ? selectedBrand
      : brands.find((brand) => brand.id === lockedBrandId);

  const getCostsService = useAuthedService(
    useCallback((token: string) => CostsService.getInstance(token), []),
  );
  const canLoad = isReady && (!lockedBrandId || Boolean(effectiveBrandId));

  const summaryQuery = useQuery({
    enabled: canLoad,
    queryFn: async () => {
      const service = await getCostsService();
      return service.getSummary(reportQuery);
    },
    queryKey: ['settings-cost-summary', organizationId, reportQuery],
  });
  const entriesQuery = useQuery({
    enabled: canLoad,
    queryFn: async () => {
      const service = await getCostsService();
      return service.getEntries({ ...reportQuery, limit: 100, skip: 0 });
    },
    queryKey: ['settings-cost-entries', organizationId, reportQuery],
  });

  const workflowsQuery = useQuery({
    enabled: canLoad,
    queryKey: ['settings-workflow-costs', organizationId, reportQuery],
    queryFn: async () => (await getCostsService()).getWorkflows(reportQuery),
  });
  const workflowColumns: TableColumn<WorkflowCostReportExecution>[] = [
    {
      header: 'Provider cost (USD)',
      key: 'accounting',
      render: (row) =>
        row.accounting?.actualProviderCostMicros == null
          ? 'Unavailable'
          : formatCurrency(row.accounting.actualProviderCostMicros / 1_000_000),
    },
    { header: 'Execution', key: 'id' },
    {
      header: 'Estimated credits',
      key: 'workflowId',
      render: (row) => row.accounting?.estimatedCredits ?? 'Unavailable',
    },
    {
      header: 'Actual credits',
      key: 'accounting',
      render: (row) =>
        row.accounting?.actualCredits ??
        `Unavailable (known ${row.accounting?.knownActualCredits ?? 0})`,
    },
    {
      header: 'Variance',
      key: 'createdAt',
      render: (row) => row.accounting?.varianceCredits ?? 'Unavailable',
    },
  ];
  const exportWorkflows = async () => {
    try {
      downloadCsv(await (await getCostsService()).exportWorkflows(reportQuery));
    } catch (error) {
      NotificationsService.getInstance().error(
        errorMessage(error, 'Workflow export failed'),
      );
    }
  };
  const summary = summaryQuery.data;
  const isLoading = summaryQuery.isLoading || entriesQuery.isLoading;
  const isRefreshing =
    (summaryQuery.isFetching || entriesQuery.isFetching) && !isLoading;
  const loadError =
    summaryQuery.error ?? entriesQuery.error ?? workflowsQuery.error;

  const brandColumns: TableColumn<ICostReportBrandTotals>[] = [
    { header: translate('tables.headers.brand'), key: 'brandLabel' },
    {
      header: translate('tables.headers.providerCost'),
      key: 'providerCostUsd',
      render: (row) => formatCurrency(row.providerCostUsd),
    },
    {
      header: translate('tables.headers.creditsUsed'),
      key: 'creditsUsed',
      render: (row) => formatCredits(row.creditsUsed),
    },
    {
      header: translate('tables.headers.generations'),
      key: 'generationCount',
      render: (row) => row.generationCount.toLocaleString(),
    },
    {
      header: translate('tables.headers.byok'),
      key: 'byokCount',
      render: (row) => row.byokCount.toLocaleString(),
    },
  ];

  const entryColumns: TableColumn<ICostReportEntry>[] = [
    {
      header: translate('tables.headers.when'),
      key: 'createdAt',
      render: (row) => formatDate(new Date(row.createdAt)),
    },
    { header: translate('tables.headers.type'), key: 'entryType' },
    { header: translate('tables.headers.brand'), key: 'brandLabel' },
    {
      header: translate('tables.headers.providerModel'),
      key: 'provider',
      render: (row) =>
        [row.provider, row.model].filter(Boolean).join(' / ') || '—',
    },
    {
      header: translate('tables.headers.providerCost'),
      key: 'providerCostUsd',
      render: (row) =>
        row.providerCostMicros > 0 ? formatCurrency(row.providerCostUsd) : '—',
    },
    {
      header: translate('tables.headers.credits'),
      key: 'creditsUsed',
      render: (row) =>
        row.creditsUsed > 0 ? formatCredits(row.creditsUsed) : '—',
    },
    {
      header: translate('tables.headers.byok'),
      key: 'isByok',
      render: (row) => (row.isByok ? translate('yes') : '—'),
    },
  ];

  const refresh = () => {
    void summaryQuery.refetch();
    void entriesQuery.refetch();
    void workflowsQuery.refetch();
  };

  const exportReport = async () => {
    setIsExporting(true);
    try {
      const service = await getCostsService();
      downloadCsv(await service.exportCsv(reportQuery));
      NotificationsService.getInstance().success(
        translate('notifications.exported'),
      );
    } catch (error) {
      logger.error('Failed to export cost report', {
        error,
        message: errorMessage(error, translate('errors.unknown')),
      });
      NotificationsService.getInstance().error(translate('errors.export'));
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (!loadError) return;
    logger.error('Failed to load cost report', {
      error: loadError,
      message: errorMessage(loadError, translate('errors.unknown')),
    });
    NotificationsService.getInstance().error(translate('errors.load'));
  }, [loadError, translate]);

  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="sr-only">{translate('title')}</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Text as="h2" size="lg" weight="semibold">
            {lockedBrandId
              ? translate('brandTitle', {
                  brand: lockedBrand?.label ?? translate('brandFallback'),
                })
              : translate('organizationTitle')}
          </Text>
          <Text size="sm" color="muted">
            {translate('description')}
          </Text>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="min-w-36">
            <Label htmlFor="cost-filter-range" className="sr-only">
              {translate('filters.dateRange')}
            </Label>
            <Select
              value={String(rangeDays)}
              onValueChange={(value) => setRangeDays(Number(value))}
            >
              <SelectTrigger
                id="cost-filter-range"
                className="h-9 min-w-36"
                aria-label={translate('filters.dateRange')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">
                  {translate('filters.lastDays', { days: 7 })}
                </SelectItem>
                <SelectItem value="30">
                  {translate('filters.lastDays', { days: 30 })}
                </SelectItem>
                <SelectItem value="90">
                  {translate('filters.lastDays', { days: 90 })}
                </SelectItem>
                <SelectItem value="366">
                  {translate('filters.lastDays', { days: 366 })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!lockedBrandId ? (
            <div className="min-w-40">
              <Label htmlFor="cost-filter-brand" className="sr-only">
                {translate('filters.brand')}
              </Label>
              <Select
                value={selectedBrandId || ALL_BRANDS_VALUE}
                onValueChange={(value) =>
                  setSelectedBrandId(value === ALL_BRANDS_VALUE ? '' : value)
                }
              >
                <SelectTrigger
                  id="cost-filter-brand"
                  className="h-9 min-w-40"
                  aria-label={translate('filters.brand')}
                >
                  <SelectValue placeholder={translate('filters.allBrands')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BRANDS_VALUE}>
                    {translate('filters.allBrands')}
                  </SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.label || brand.slug || brand.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            className="h-9"
            onClick={() => void exportReport()}
            isDisabled={isExporting}
          >
            <Download className="mr-2 size-4" aria-hidden />
            {translate('actions.exportCsv')}
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            className="h-9"
            onClick={refresh}
            isDisabled={isRefreshing}
          >
            <RefreshCw
              className={`mr-2 size-4 ${isRefreshing ? 'animate-spin' : ''}`}
              aria-hidden
            />
            {translate('actions.refresh')}
          </Button>
        </div>
      </div>

      {loadError ? (
        <Card
          className="border-destructive/40 bg-destructive/5"
          bodyClassName="gap-3 p-4"
        >
          <Text size="sm" weight="medium">
            {translate('errors.loadTitle')}
          </Text>
          <Text size="sm" color="muted">
            {translate('errors.tryRefresh', {
              message: errorMessage(loadError, translate('errors.unknown')),
            })}
          </Text>
        </Card>
      ) : null}

      <div className="space-y-2">
        <AppTable
          label="Workflow accounting"
          columns={workflowColumns}
          items={workflowsQuery.data ?? []}
          isLoading={workflowsQuery.isLoading}
          getRowKey={(row) => row.id}
          emptyLabel="No executions"
        />
        <Text size="xs" color="muted">
          Latest 100 executions in this period. Workflow totals are a separate
          view of the ledger.
        </Text>
        <Button variant={ButtonVariant.SECONDARY} onClick={exportWorkflows}>
          Export workflow costs
        </Button>
      </div>

      <MetricCardGrid columns={4}>
        <MetricCard
          label={translate('metrics.providerCost.label')}
          value={summary ? formatCurrency(summary.total.providerCostUsd) : '—'}
          description={translate('metrics.providerCost.description')}
          isLoading={summaryQuery.isLoading}
        />
        <MetricCard
          label={translate('metrics.creditsUsed.label')}
          value={summary ? formatCredits(summary.total.creditsUsed) : '—'}
          description={translate('metrics.creditsUsed.description')}
          isLoading={summaryQuery.isLoading}
        />
        <MetricCard
          label={translate('metrics.generations.label')}
          value={summary?.total.generationCount.toLocaleString() ?? '—'}
          description={
            summary
              ? translate('metrics.generations.description', {
                  llm: summary.total.llmCount,
                  media: summary.total.mediaCount,
                })
              : undefined
          }
          isLoading={summaryQuery.isLoading}
        />
        <MetricCard
          label={translate('metrics.byok.label')}
          value={summary?.total.byokCount.toLocaleString() ?? '—'}
          description={translate('metrics.byok.description')}
          isLoading={summaryQuery.isLoading}
        />
      </MetricCardGrid>

      {!lockedBrandId ? (
        <AppTable
          label={translate('tables.brandSplit.label')}
          columns={brandColumns}
          items={summary?.byBrand ?? []}
          isLoading={summaryQuery.isLoading}
          getRowKey={(row) => row.brandId ?? '__unattributed__'}
          emptyLabel={translate('tables.emptyLabel')}
          emptyDescription={translate('tables.brandSplit.emptyDescription')}
        />
      ) : null}

      <div className="space-y-2">
        <AppTable
          label={translate('tables.ledger.label')}
          columns={entryColumns}
          items={entriesQuery.data ?? []}
          isLoading={isLoading}
          getRowKey={(row) => `${row.entryType}:${row.id}`}
          emptyLabel={translate('tables.emptyLabel')}
          emptyDescription={translate('tables.ledger.emptyDescription')}
        />
        <Text size="xs" color="muted">
          {translate('tables.ledger.limitNotice', { limit: 100 })}
        </Text>
      </div>
    </div>
  );
}
