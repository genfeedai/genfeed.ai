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
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Text } from '@ui/typography/text';
import { Download, RefreshCw } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildUsageRowsCsv,
  usageDailySeries,
  usageModelLabel,
} from '@/features/settings/cost-usage/usage-report.util';

const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), {
  ssr: false,
});
const Area = dynamic(() => import('recharts').then((m) => m.Area), {
  ssr: false,
});
const BarChart = dynamic(() => import('recharts').then((m) => m.BarChart), {
  ssr: false,
});
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), {
  ssr: false,
});
const CartesianGrid = dynamic(
  () => import('recharts').then((m) => m.CartesianGrid),
  { ssr: false },
);
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), {
  ssr: false,
});
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), {
  ssr: false,
});
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), {
  ssr: false,
});

const PAGE_SIZE = 25;
const ALL_BRANDS_VALUE = '__all_brands__';

interface CostUsagePageProps {
  lockedBrandId?: string;
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
    value,
  );
}

function downloadCsv(csv: string | ArrayBuffer, filename: string): void {
  const url = window.URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function CostUsagePage({ lockedBrandId }: CostUsagePageProps) {
  const translate = useTranslations('pages.costUsage');
  const { brands, isReady, organizationId } = useBrand();
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [rangeDays, setRangeDays] = useState(30);
  const [activeTab, setActiveTab] = useState('overview');
  const [pageState, setPageState] = useState({ scope: '', page: 1 });
  const [isExporting, setIsExporting] = useState(false);
  const effectiveBrandId = lockedBrandId ?? selectedBrandId;
  const reportQuery = useMemo<ICostReportQuery>(() => {
    const to = new Date();
    return {
      from: new Date(to.getTime() - rangeDays * 86_400_000).toISOString(),
      to: to.toISOString(),
      ...(effectiveBrandId ? { brandId: effectiveBrandId } : {}),
    };
  }, [rangeDays, effectiveBrandId]);
  const scope = `${organizationId}:${effectiveBrandId}:${rangeDays}`;
  const page = pageState.scope === scope ? pageState.page : 1;
  useEffect(() => setPageState({ scope, page: 1 }), [scope]);
  const getCostsService = useAuthedService(
    useCallback((token: string) => CostsService.getInstance(token), []),
  );
  const canLoad = isReady && (!lockedBrandId || Boolean(effectiveBrandId));
  const summaryQuery = useQuery({
    enabled: canLoad,
    queryKey: ['settings-cost-summary', organizationId, reportQuery],
    queryFn: async () => (await getCostsService()).getSummary(reportQuery),
  });
  const entriesQuery = useQuery({
    enabled: canLoad && activeTab === 'generations',
    queryKey: ['settings-cost-entries', organizationId, reportQuery, page],
    queryFn: async () =>
      (await getCostsService()).getEntriesPage({
        ...reportQuery,
        limit: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
  });
  const workflowsQuery = useQuery({
    enabled: canLoad && activeTab === 'workflows',
    queryKey: ['settings-workflow-costs', organizationId, reportQuery],
    queryFn: async () => (await getCostsService()).getWorkflows(reportQuery),
  });
  const summary = summaryQuery.data;
  const daily = useMemo(
    () =>
      summary ? usageDailySeries(summary.daily, summary.from, summary.to) : [],
    [summary],
  );
  const activeQuery =
    activeTab === 'generations'
      ? entriesQuery
      : activeTab === 'workflows'
        ? workflowsQuery
        : summaryQuery;
  const loadError = activeQuery.error;
  const refresh = () => {
    void summaryQuery.refetch();
    if (activeTab === 'generations') void entriesQuery.refetch();
    if (activeTab === 'workflows') void workflowsQuery.refetch();
  };
  const exportReport = async () => {
    setIsExporting(true);
    try {
      const service = await getCostsService();
      if (activeTab === 'workflows') {
        const rows = await service.getWorkflows(reportQuery);
        downloadCsv(
          buildUsageRowsCsv([
            ['Execution', 'Credits used'],
            ...rows.map((row) => [row.id, row.accounting?.actualCredits ?? '']),
          ]),
          'workflow-credits.csv',
        );
      } else {
        downloadCsv(
          await service.exportUsageCsv(reportQuery),
          'generation-credits.csv',
        );
      }
      NotificationsService.getInstance().success(
        translate('notifications.exported'),
      );
    } catch {
      NotificationsService.getInstance().error(translate('errors.export'));
    } finally {
      setIsExporting(false);
    }
  };
  const creditValue = (row: ICostReportEntry) =>
    row.entryType === 'credit' || row.creditsUsed > 0
      ? `${formatCredits(row.creditsUsed)} GEN`
      : translate('notRecorded');
  const entryColumns: TableColumn<ICostReportEntry>[] = [
    {
      header: translate('tables.headers.when'),
      key: 'createdAt',
      render: (row) => formatDate(new Date(row.createdAt)),
    },
    {
      header: translate('tables.headers.type'),
      key: 'entryType',
      render: (row) => translate(`entryTypes.${row.entryType}`),
    },
    ...(!lockedBrandId
      ? [{ header: translate('tables.headers.brand'), key: 'brandLabel' }]
      : []),
    {
      header: translate('tables.headers.model'),
      key: 'model',
      render: (row) => usageModelLabel(row.model),
    },
    {
      header: translate('tables.headers.creditsUsed'),
      key: 'creditsUsed',
      render: creditValue,
    },
  ];
  const brandColumns: TableColumn<ICostReportBrandTotals>[] = [
    { header: translate('tables.headers.brand'), key: 'brandLabel' },
    {
      header: translate('tables.headers.creditsUsed'),
      key: 'creditsUsed',
      render: (row) => `${formatCredits(row.creditsUsed)} GEN`,
    },
    { header: translate('tables.headers.generations'), key: 'generationCount' },
  ];
  const workflowColumns: TableColumn<WorkflowCostReportExecution>[] = [
    { header: translate('workflowAccounting.execution'), key: 'id' },
    {
      header: translate('tables.headers.creditsUsed'),
      key: 'actualCredits',
      render: (row) =>
        row.accounting?.actualCredits == null
          ? translate('notRecorded')
          : `${formatCredits(row.accounting.actualCredits)} GEN`,
    },
  ];
  const totalEntries = entriesQuery.data?.total ?? 0;

  return (
    <Container
      label={translate('title')}
      titleVisibility="sr-only"
      headerTabs={{
        activeTab,
        onTabChange: setActiveTab,
        fullWidth: false,
        tabs: ['overview', 'generations', 'workflows'].map((id) => ({
          id,
          label: translate(`tabs.${id}`),
        })),
      }}
      right={
        <>
          <Select
            value={String(rangeDays)}
            onValueChange={(value) => setRangeDays(Number(value))}
          >
            <SelectTrigger
              className="h-8 w-36"
              aria-label={translate('filters.dateRange')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[7, 30, 90, 366].map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {translate('filters.lastDays', { days })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!lockedBrandId ? (
            <Select
              value={selectedBrandId || ALL_BRANDS_VALUE}
              onValueChange={(value) =>
                setSelectedBrandId(value === ALL_BRANDS_VALUE ? '' : value)
              }
            >
              <SelectTrigger
                className="h-8 w-40"
                aria-label={translate('filters.brand')}
              >
                <SelectValue />
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
          ) : null}
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={() => void exportReport()}
            isDisabled={!canLoad || isExporting}
          >
            <Download className="size-4" aria-hidden />
            {translate('actions.exportCsv')}
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={refresh}
            isDisabled={activeQuery.isFetching}
          >
            <RefreshCw className="size-4" aria-hidden />
            {translate('actions.refresh')}
          </Button>
        </>
      }
    >
      <div className="space-y-6 pb-6">
        {loadError ? (
          <Card>
            <Text color="muted">{translate('errors.loadTitle')}</Text>
          </Card>
        ) : null}
        {activeTab === 'overview' ? (
          <>
            <MetricCardGrid columns={3}>
              <MetricCard
                label={translate('metrics.creditsUsed.label')}
                value={
                  summary
                    ? `${formatCredits(summary.total.creditsUsed)} GEN`
                    : '—'
                }
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
                label={translate('metrics.activeDays.label')}
                value={
                  summary
                    ? String(
                        summary.daily.filter(
                          (day) =>
                            day.generationCount > 0 || day.creditsUsed > 0,
                        ).length,
                      )
                    : '—'
                }
                description={translate('metrics.activeDays.description')}
                isLoading={summaryQuery.isLoading}
              />
            </MetricCardGrid>
            <div className="grid gap-4 lg:grid-cols-2">
              {(['creditsUsed', 'generationCount'] as const).map((metric) => (
                <Card key={metric}>
                  <Text as="h2" weight="semibold">
                    {translate(`charts.${metric}`)}
                  </Text>
                  {summaryQuery.isLoading ? (
                    <Text color="muted">{translate('charts.loading')}</Text>
                  ) : !summary ||
                    (summary.total.generationCount === 0 &&
                      summary.total.creditsUsed === 0) ? (
                    <Text color="muted">{translate('tables.emptyLabel')}</Text>
                  ) : (
                    <ChartContainer
                      className="rounded-none border-0 bg-transparent p-0 shadow-none"
                      height={240}
                      config={{
                        [metric]: {
                          label: translate(`charts.${metric}`),
                          color: 'hsl(var(--foreground))',
                        },
                      }}
                      aria-label={translate(`charts.${metric}`)}
                    >
                      {metric === 'creditsUsed' ? (
                        <AreaChart data={daily}>
                          <CartesianGrid
                            vertical={false}
                            stroke="hsl(var(--border))"
                          />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                            tickFormatter={(date: string) => date.slice(5)}
                            minTickGap={30}
                          />
                          <YAxis
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                            width={45}
                            tickFormatter={formatCredits}
                          />
                          <Tooltip content={<ChartTooltipContent />} />
                          <Area
                            dataKey={metric}
                            type="monotone"
                            stroke="hsl(var(--foreground))"
                            fill="hsl(var(--foreground))"
                            fillOpacity={0.12}
                          />
                        </AreaChart>
                      ) : (
                        <BarChart data={daily}>
                          <CartesianGrid
                            vertical={false}
                            stroke="hsl(var(--border))"
                          />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                            tickFormatter={(date: string) => date.slice(5)}
                            minTickGap={30}
                          />
                          <YAxis
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                            width={45}
                            allowDecimals={false}
                          />
                          <Tooltip content={<ChartTooltipContent />} />
                          <Bar
                            dataKey={metric}
                            fill="hsl(var(--foreground))"
                            fillOpacity={0.6}
                            radius={[3, 3, 0, 0]}
                          />
                        </BarChart>
                      )}
                    </ChartContainer>
                  )}
                </Card>
              ))}
            </div>
            {!lockedBrandId ? (
              <AppTable
                label={translate('tables.brandSplit.label')}
                columns={brandColumns}
                items={summary?.byBrand ?? []}
                isLoading={summaryQuery.isLoading}
                getRowKey={(row) => row.brandId ?? '__unattributed__'}
                emptyLabel={translate('tables.emptyLabel')}
              />
            ) : null}
          </>
        ) : null}
        {activeTab === 'generations' ? (
          <>
            <AppTable
              label={translate('tables.ledger.label')}
              columns={entryColumns}
              items={entriesQuery.data?.docs ?? []}
              isLoading={entriesQuery.isLoading}
              getRowKey={(row) => `${row.entryType}:${row.id}`}
              emptyLabel={translate('tables.emptyLabel')}
              emptyDescription={translate('tables.ledger.emptyDescription')}
            />
            <Pagination
              currentPage={page}
              totalPages={Math.max(1, Math.ceil(totalEntries / PAGE_SIZE))}
              totalItems={totalEntries}
              totalLabel={translate('tables.ledger.entries')}
              onPageChange={(nextPage) =>
                setPageState({ scope, page: nextPage })
              }
            />
            <Text size="xs" color="muted">
              {translate('tables.ledger.creditNotice')}
            </Text>
          </>
        ) : null}
        {activeTab === 'workflows' ? (
          <>
            <AppTable
              label={translate('workflowAccounting.title')}
              columns={workflowColumns}
              items={workflowsQuery.data ?? []}
              isLoading={workflowsQuery.isLoading}
              getRowKey={(row) => row.id}
              emptyLabel={translate('workflowAccounting.empty')}
            />
            <Text size="xs" color="muted">
              {translate('workflowAccounting.limit')}
            </Text>
          </>
        ) : null}
      </div>
    </Container>
  );
}
