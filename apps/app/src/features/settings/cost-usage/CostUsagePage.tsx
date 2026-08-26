'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  ICostReportBrandTotals,
  ICostReportEntry,
  ICostReportQuery,
} from '@genfeedai/interfaces/billing';
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

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Unknown error';
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
  const { brands, isReady, selectedBrand } = useBrand();
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
    queryKey: ['settings-cost-summary', reportQuery],
  });
  const entriesQuery = useQuery({
    enabled: canLoad,
    queryFn: async () => {
      const service = await getCostsService();
      return service.getEntries({ ...reportQuery, limit: 100, skip: 0 });
    },
    queryKey: ['settings-cost-entries', reportQuery],
  });

  const summary = summaryQuery.data;
  const isLoading = summaryQuery.isLoading || entriesQuery.isLoading;
  const isRefreshing =
    (summaryQuery.isFetching || entriesQuery.isFetching) && !isLoading;
  const loadError = summaryQuery.error ?? entriesQuery.error;

  const brandColumns: TableColumn<ICostReportBrandTotals>[] = [
    { header: 'Brand', key: 'brandLabel' },
    {
      header: 'Provider cost',
      key: 'providerCostUsd',
      render: (row) => formatCurrency(row.providerCostUsd),
    },
    {
      header: 'Credits used',
      key: 'creditsUsed',
      render: (row) => formatCredits(row.creditsUsed),
    },
    {
      header: 'Generations',
      key: 'generationCount',
      render: (row) => row.generationCount.toLocaleString(),
    },
    {
      header: 'BYOK',
      key: 'byokCount',
      render: (row) => row.byokCount.toLocaleString(),
    },
  ];

  const entryColumns: TableColumn<ICostReportEntry>[] = [
    {
      header: 'When',
      key: 'createdAt',
      render: (row) => formatDate(new Date(row.createdAt)),
    },
    { header: 'Type', key: 'entryType' },
    { header: 'Brand', key: 'brandLabel' },
    {
      header: 'Provider / model',
      key: 'provider',
      render: (row) =>
        [row.provider, row.model].filter(Boolean).join(' / ') || '—',
    },
    {
      header: 'Provider cost',
      key: 'providerCostUsd',
      render: (row) =>
        row.providerCostMicros > 0 ? formatCurrency(row.providerCostUsd) : '—',
    },
    {
      header: 'Credits',
      key: 'creditsUsed',
      render: (row) =>
        row.creditsUsed > 0 ? formatCredits(row.creditsUsed) : '—',
    },
    {
      header: 'BYOK',
      key: 'isByok',
      render: (row) => (row.isByok ? 'Yes' : '—'),
    },
  ];

  const refresh = () => {
    void summaryQuery.refetch();
    void entriesQuery.refetch();
  };

  const exportReport = async () => {
    setIsExporting(true);
    try {
      const service = await getCostsService();
      downloadCsv(await service.exportCsv(reportQuery));
      NotificationsService.getInstance().success('Cost report exported');
    } catch (error) {
      logger.error('Failed to export cost report', {
        error,
        message: errorMessage(error),
      });
      NotificationsService.getInstance().error('Failed to export cost report');
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (!loadError) return;
    logger.error('Failed to load cost report', {
      error: loadError,
      message: errorMessage(loadError),
    });
    NotificationsService.getInstance().error('Failed to load cost report');
  }, [loadError]);

  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="sr-only">Cost & Usage</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Text as="h2" size="lg" weight="semibold">
            {lockedBrandId
              ? `${lockedBrand?.label ?? 'Brand'} brand costs`
              : 'Organization generation costs'}
          </Text>
          <Text size="sm" color="muted">
            Actual provider cost and customer-facing credits are reported
            separately.
          </Text>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="min-w-36">
            <Label htmlFor="cost-filter-range" className="sr-only">
              Date range
            </Label>
            <Select
              value={String(rangeDays)}
              onValueChange={(value) => setRangeDays(Number(value))}
            >
              <SelectTrigger
                id="cost-filter-range"
                className="h-9 min-w-36"
                aria-label="Date range"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="366">Last 366 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!lockedBrandId ? (
            <div className="min-w-40">
              <Label htmlFor="cost-filter-brand" className="sr-only">
                Brand
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
                  aria-label="Brand"
                >
                  <SelectValue placeholder="All brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BRANDS_VALUE}>All brands</SelectItem>
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
            Export CSV
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
            Refresh
          </Button>
        </div>
      </div>

      {loadError ? (
        <Card
          className="border-destructive/40 bg-destructive/5"
          bodyClassName="gap-3 p-4"
        >
          <Text size="sm" weight="medium">
            Could not load cost data
          </Text>
          <Text size="sm" color="muted">
            {errorMessage(loadError)}. Try Refresh.
          </Text>
        </Card>
      ) : null}

      <MetricCardGrid columns={4}>
        <MetricCard
          label="Provider cost"
          value={summary ? formatCurrency(summary.total.providerCostUsd) : '—'}
          description="Actual platform vendor spend"
          isLoading={summaryQuery.isLoading}
        />
        <MetricCard
          label="Credits used"
          value={summary ? formatCredits(summary.total.creditsUsed) : '—'}
          description="Customer-facing usage meter"
          isLoading={summaryQuery.isLoading}
        />
        <MetricCard
          label="Generations"
          value={summary?.total.generationCount.toLocaleString() ?? '—'}
          description={
            summary
              ? `${summary.total.llmCount} LLM · ${summary.total.mediaCount} media`
              : undefined
          }
          isLoading={summaryQuery.isLoading}
        />
        <MetricCard
          label="BYOK generations"
          value={summary?.total.byokCount.toLocaleString() ?? '—'}
          description="Tracked at zero platform vendor cost"
          isLoading={summaryQuery.isLoading}
        />
      </MetricCardGrid>

      {!lockedBrandId ? (
        <AppTable
          label="Cost split by brand"
          columns={brandColumns}
          items={summary?.byBrand ?? []}
          isLoading={summaryQuery.isLoading}
          getRowKey={(row) => row.brandId ?? '__unattributed__'}
          emptyLabel="No generation costs yet"
          emptyDescription="Brand-attributed provider cost and credits will appear here."
        />
      ) : null}

      <AppTable
        label="Generation ledger"
        columns={entryColumns}
        items={entriesQuery.data ?? []}
        isLoading={isLoading}
        getRowKey={(row) => `${row.entryType}:${row.id}`}
        emptyLabel="No generation costs yet"
        emptyDescription="Provider cost and credit events in this scope will appear here."
      />
    </div>
  );
}
