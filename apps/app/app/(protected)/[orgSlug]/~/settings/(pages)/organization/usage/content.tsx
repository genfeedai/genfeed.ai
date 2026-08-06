'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import {
  CreditsService,
  type CreditTransactionRow,
  type CreditUsageMetrics,
  type CreditUsageSeriesPoint,
} from '@services/billing/credits.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
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
import { RefreshCw } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';

const ALL_BRANDS_VALUE = '__all_brands__';
const ALL_CATEGORIES_VALUE = '__all_categories__';

/** Shared empty copy for chart + ledger so empty surfaces look identical. */
const USAGE_EMPTY_TITLE = 'No credit activity yet';
const USAGE_EMPTY_DESCRIPTION =
  'Deductions and grants for this organization will show up here.';

type ChartRange = 'daily' | 'weekly' | 'monthly';

const Area = dynamic(() => import('recharts').then((module) => module.Area), {
  ssr: false,
});
const AreaChart = dynamic(
  () => import('recharts').then((module) => module.AreaChart),
  { ssr: false },
);
const CartesianGrid = dynamic(
  () => import('recharts').then((module) => module.CartesianGrid),
  { ssr: false },
);
const ResponsiveContainer = dynamic(
  () => import('recharts').then((module) => module.ResponsiveContainer),
  { ssr: false },
);
const Tooltip = dynamic(
  () => import('recharts').then((module) => module.Tooltip),
  { ssr: false },
);
const XAxis = dynamic(() => import('recharts').then((module) => module.XAxis), {
  ssr: false,
});
const YAxis = dynamic(() => import('recharts').then((module) => module.YAxis), {
  ssr: false,
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return 'Unknown error';
}

function formatAmount(amount: number): string {
  const absolute = Math.abs(amount);
  const formatted = absolute.toLocaleString();
  if (amount < 0) {
    return `−${formatted}`;
  }
  if (amount > 0) {
    return `+${formatted}`;
  }
  return formatted;
}

function readMetadataBrandId(
  metadata: CreditTransactionRow['metadata'],
): string {
  if (!metadata || typeof metadata !== 'object') {
    return '';
  }
  const value = metadata.brandId;
  return typeof value === 'string' ? value : '';
}

function formatChartLabel(date: string, range: ChartRange): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  if (range === 'monthly') {
    return parsed.toLocaleDateString(undefined, {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    });
  }
  if (range === 'weekly') {
    return parsed.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function UsageChart({
  series,
  range,
  isLoading,
}: {
  series: CreditUsageSeriesPoint[];
  range: ChartRange;
  isLoading: boolean;
}) {
  const chartData = useMemo(
    () =>
      series.map((point) => ({
        amount: point.amount,
        date: point.date,
        label: formatChartLabel(point.date, range),
      })),
    [range, series],
  );

  const total = useMemo(
    () => chartData.reduce((sum, point) => sum + point.amount, 0),
    [chartData],
  );

  if (isLoading) {
    return <div className="h-72 w-full animate-pulse rounded-md bg-muted/40" />;
  }

  if (chartData.length === 0 || total === 0) {
    return (
      <CardEmptyContent
        className="min-h-72"
        label={USAGE_EMPTY_TITLE}
        description={USAGE_EMPTY_DESCRIPTION}
      />
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height={288}>
        <AreaChart
          data={chartData}
          margin={{ bottom: 0, left: 0, right: 12, top: 8 }}
        >
          <defs>
            <linearGradient id="usageCredits" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.35}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{
              color: 'hsl(var(--muted-foreground))',
              marginBottom: 4,
            }}
            formatter={(value: unknown) => [
              `${Number(value ?? 0).toLocaleString()} credits`,
              'Used',
            ]}
          />
          <Area
            type="monotone"
            dataKey="amount"
            name="Used"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            fill="url(#usageCredits)"
            dot={false}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function SettingsUsagePage() {
  const { brands, isReady } = useBrand();
  const [brandId, setBrandId] = useState('');
  const [category, setCategory] = useState('');
  const [chartRange, setChartRange] = useState<ChartRange>('daily');

  const getCreditsService = useAuthedService(
    useCallback((token: string) => CreditsService.getInstance(token), []),
  );

  const metricsQuery = useQuery({
    enabled: isReady,
    queryKey: ['settings-credit-usage-metrics'],
    queryFn: async () => {
      const service = await getCreditsService();
      return service.getUsageMetrics();
    },
  });

  const transactionsQuery = useQuery({
    enabled: isReady,
    queryKey: ['settings-credit-transactions', brandId, category],
    queryFn: async () => {
      const service = await getCreditsService();
      return service.listTransactions({
        brandId: brandId || undefined,
        category: category || undefined,
        limit: 100,
        skip: 0,
      });
    },
  });

  const brandLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const brand of brands) {
      if (brand?.id) {
        map.set(
          String(brand.id),
          brand.label || brand.slug || String(brand.id),
        );
      }
    }
    return map;
  }, [brands]);

  const columns: TableColumn<CreditTransactionRow>[] = [
    {
      header: 'When',
      key: 'createdAt',
      render: (row) =>
        row.createdAt ? formatDate(new Date(row.createdAt)) : '—',
    },
    {
      header: 'Source',
      key: 'source',
      render: (row) => row.source || '—',
    },
    {
      header: 'Category',
      key: 'category',
      render: (row) => row.category || '—',
    },
    {
      header: 'Brand',
      key: 'brand',
      render: (row) => {
        const id = readMetadataBrandId(row.metadata);
        if (!id) {
          return '—';
        }
        return brandLabelById.get(id) || id;
      },
    },
    {
      header: 'Description',
      key: 'description',
      render: (row) => row.description || '—',
    },
    {
      header: 'Amount',
      key: 'amount',
      render: (row) => formatAmount(Number(row.amount) || 0),
    },
    {
      header: 'Balance after',
      key: 'balanceAfter',
      render: (row) =>
        typeof row.balanceAfter === 'number'
          ? row.balanceAfter.toLocaleString()
          : '—',
    },
  ];

  const metrics: CreditUsageMetrics | undefined = metricsQuery.data;
  const isLoading = metricsQuery.isLoading || transactionsQuery.isLoading;
  const isRefreshing =
    (metricsQuery.isFetching || transactionsQuery.isFetching) && !isLoading;

  const chartSeries = useMemo(() => {
    if (!metrics) {
      return [] as CreditUsageSeriesPoint[];
    }
    if (chartRange === 'weekly') {
      return metrics.weeklySeries ?? [];
    }
    if (chartRange === 'monthly') {
      return metrics.monthlySeries ?? [];
    }
    return metrics.dailySeries ?? [];
  }, [chartRange, metrics]);

  const chartTotal = useMemo(
    () => chartSeries.reduce((sum, point) => sum + point.amount, 0),
    [chartSeries],
  );

  const refresh = () => {
    void metricsQuery.refetch();
    void transactionsQuery.refetch();
  };

  const loadError = metricsQuery.error ?? transactionsQuery.error;

  useEffect(() => {
    if (metricsQuery.error) {
      logger.error('Failed to load credit usage metrics', {
        error: metricsQuery.error,
        message: errorMessage(metricsQuery.error),
      });
      NotificationsService.getInstance().error(
        'Failed to load credit usage metrics',
      );
    }
  }, [metricsQuery.error]);

  useEffect(() => {
    if (transactionsQuery.error) {
      logger.error('Failed to load credit transactions', {
        error: transactionsQuery.error,
        message: errorMessage(transactionsQuery.error),
      });
      NotificationsService.getInstance().error(
        'Failed to load credit transactions',
      );
    }
  }, [transactionsQuery.error]);

  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="sr-only">Usage</h1>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <fieldset className="m-0 flex items-center gap-1 rounded-md border border-border p-0.5">
          <legend className="sr-only">Chart range</legend>
          {(
            [
              { key: 'daily', label: 'Daily' },
              { key: 'weekly', label: 'Weekly' },
              { key: 'monthly', label: 'Monthly' },
            ] as const
          ).map((option) => (
            <Button
              key={option.key}
              type="button"
              size={ButtonSize.SM}
              variant={
                chartRange === option.key
                  ? ButtonVariant.SECONDARY
                  : ButtonVariant.GHOST
              }
              className="h-8 px-3 text-xs"
              onClick={() => setChartRange(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </fieldset>

        <div className="flex min-w-40 flex-col gap-1.5">
          <Label htmlFor="usage-filter-brand" className="sr-only">
            Brand
          </Label>
          <Select
            value={brandId || ALL_BRANDS_VALUE}
            onValueChange={(value) =>
              setBrandId(value === ALL_BRANDS_VALUE ? '' : value)
            }
          >
            <SelectTrigger
              id="usage-filter-brand"
              className="h-9 w-full min-w-40"
              aria-label="Brand"
            >
              <SelectValue placeholder="All brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANDS_VALUE}>All brands</SelectItem>
              {brands.map((brand) =>
                brand?.id ? (
                  <SelectItem key={String(brand.id)} value={String(brand.id)}>
                    {brand.label || brand.slug || String(brand.id)}
                  </SelectItem>
                ) : null,
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-32 flex-col gap-1.5">
          <Label htmlFor="usage-filter-category" className="sr-only">
            Category
          </Label>
          <Select
            value={category || ALL_CATEGORIES_VALUE}
            onValueChange={(value) =>
              setCategory(value === ALL_CATEGORIES_VALUE ? '' : value)
            }
          >
            <SelectTrigger
              id="usage-filter-category"
              className="h-9 w-full min-w-32"
              aria-label="Category"
            >
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES_VALUE}>All</SelectItem>
              <SelectItem value="deduct">Deduct</SelectItem>
              <SelectItem value="add">Add</SelectItem>
              <SelectItem value="refund">Refund</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant={ButtonVariant.OUTLINE}
          size={ButtonSize.SM}
          className="h-9"
          onClick={refresh}
          isDisabled={isRefreshing}
        >
          <RefreshCw
            className={`mr-2 size-4 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>

      {loadError ? (
        <Card
          className="border-destructive/40 bg-destructive/5"
          bodyClassName="gap-3 p-4"
        >
          <Text size="sm" weight="medium">
            Could not load usage data
          </Text>
          <Text size="sm" color="muted" className="mt-1">
            {errorMessage(loadError)}. Try Refresh, or sign out and back in if
            your session expired.
          </Text>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card bodyClassName="gap-3 p-4">
          <Text size="sm" color="muted">
            Balance
          </Text>
          <Text as="p" size="xl" weight="bold">
            {(metrics?.currentBalance ?? 0).toLocaleString()}
          </Text>
        </Card>
        <Card bodyClassName="gap-3 p-4">
          <Text size="sm" color="muted">
            Used (7 days)
          </Text>
          <Text as="p" size="xl" weight="bold">
            {(metrics?.usage7Days ?? 0).toLocaleString()}
          </Text>
        </Card>
        <Card bodyClassName="gap-3 p-4">
          <Text size="sm" color="muted">
            Used (30 days)
          </Text>
          <Text as="p" size="xl" weight="bold">
            {(metrics?.usage30Days ?? 0).toLocaleString()}
          </Text>
        </Card>
        <Card bodyClassName="gap-3 p-4">
          <Text size="sm" color="muted">
            7d vs 30d trend
          </Text>
          <Text as="p" size="xl" weight="bold">
            {typeof metrics?.trendPercentage === 'number'
              ? `${metrics.trendPercentage > 0 ? '+' : ''}${metrics.trendPercentage}%`
              : '—'}
          </Text>
        </Card>
      </div>

      <Card
        label="Usage over time"
        description={`${chartTotal.toLocaleString()} credits in selected range`}
        bodyClassName="gap-3 p-4"
      >
        <UsageChart
          series={chartSeries}
          range={chartRange}
          isLoading={metricsQuery.isLoading}
        />
      </Card>

      {metrics?.breakdown && metrics.breakdown.length > 0 ? (
        <Card label="By source (30 days)" bodyClassName="gap-3 p-4">
          <div className="divide-y divide-border/60">
            {metrics.breakdown.slice(0, 9).map((item) => (
              <div
                key={item.source}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <Text size="sm" weight="medium">
                  {item.source}
                </Text>
                <Text size="xs" color="muted" className="shrink-0 tabular-nums">
                  {item.amount.toLocaleString()} credits · {item.count} events
                </Text>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* AppTable owns its own card shell — title via `label` (same chrome as Card). */}
      <AppTable
        label="Ledger"
        columns={columns}
        items={transactionsQuery.data ?? []}
        isLoading={isLoading}
        getRowKey={(row) => row.id}
        emptyLabel={USAGE_EMPTY_TITLE}
        emptyDescription={USAGE_EMPTY_DESCRIPTION}
      />
    </div>
  );
}
