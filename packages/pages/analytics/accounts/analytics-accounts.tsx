'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { AnalyticsMetric, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IAccountAnalytics,
  IAccountAnalyticsList,
  IFleetEvaluationPolicy,
} from '@genfeedai/contracts/interfaces';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { TableColumn } from '@props/ui/display/table.props';
import { AnalyticsService } from '@services/analytics/analytics.service';
import Table from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useCallback, useEffect, useMemo, useState } from 'react';

function metricLabel(
  account: IAccountAnalytics,
  metric: AnalyticsMetric,
): string {
  const value = account.metrics.find((item) => item.metric === metric);
  if (value?.availability !== 'observed' || value.change === null) {
    return 'Unavailable';
  }
  return formatCompactNumberIntl(value.change);
}

export default function AnalyticsAccounts() {
  const { brandId } = useCollectionScope();
  const { dateRange } = useAnalyticsContext();
  const getService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );
  const [search, setSearch] = useState('');
  const [metric, setMetric] = useState<AnalyticsMetric>(AnalyticsMetric.VIEWS);
  const [list, setList] = useState<IAccountAnalyticsList | null>(null);
  const [policy, setPolicy] = useState<IFleetEvaluationPolicy | null>(null);
  const [windowWeeks, setWindowWeeks] = useState('4');
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(
    async (signal: AbortSignal) => {
      const service = await getService();
      const { startDate, endDate } = getDateRangeWithDefaults(
        dateRange.startDate ?? undefined,
        dateRange.endDate ?? undefined,
      );
      const [accounts, evaluationPolicy] = await Promise.all([
        service.getAccountAnalytics({
          brandId: brandId || undefined,
          endDate,
          metric,
          search: search || undefined,
          startDate,
        }) as Promise<IAccountAnalyticsList>,
        service.getFleetEvaluationPolicy({
          brandId: brandId || undefined,
        }) as Promise<IFleetEvaluationPolicy>,
      ]);
      if (signal.aborted) {
        return;
      }
      setList(accounts);
      setPolicy(evaluationPolicy);
      if (evaluationPolicy?.windowWeeks) {
        setWindowWeeks(String(evaluationPolicy.windowWeeks));
      }
      setIsLoading(false);
    },
    [
      brandId,
      dateRange.endDate,
      dateRange.startDate,
      getService,
      metric,
      search,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const columns: TableColumn<IAccountAnalytics>[] = useMemo(
    () => [
      {
        key: 'account',
        header: 'Account',
        render: (row) =>
          row.identity.label ||
          row.identity.externalHandle ||
          row.identity.externalName ||
          row.identity.credentialId,
      },
      {
        key: 'brand',
        header: 'Brand',
        render: (row) => row.identity.brandLabel,
      },
      {
        key: 'platform',
        header: 'Platform',
        render: (row) => row.identity.platform,
      },
      {
        key: 'posts',
        header: 'Posts',
        render: (row) => String(row.publishedPosts),
      },
      {
        key: 'metric',
        header: 'Metric',
        render: (row) => metricLabel(row, metric),
      },
      {
        key: 'health',
        header: 'Health',
        render: (row) => row.evaluation?.state ?? 'Manual',
      },
    ],
    [metric],
  );

  return (
    <Container
      titleVisibility="sr-only"
      headerTabs={undefined}
      right={
        <div className="flex items-center gap-2">
          <Input
            aria-label="Search accounts"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search accounts"
          />
          <Select
            value={metric}
            onValueChange={(value) => setMetric(value as AnalyticsMetric)}
          >
            <SelectTrigger aria-label="Rank by metric">
              <SelectValue placeholder="Metric" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AnalyticsMetric.VIEWS}>Views</SelectItem>
              <SelectItem value={AnalyticsMetric.FOLLOWERS}>
                Followers
              </SelectItem>
              <SelectItem value={AnalyticsMetric.POSTS}>Posts</SelectItem>
            </SelectContent>
          </Select>
          <Input
            aria-label="Evaluation weeks"
            value={windowWeeks}
            onChange={(event) => setWindowWeeks(event.target.value)}
          />
          <Button
            label="Save evaluation"
            variant={ButtonVariant.SECONDARY}
            onClick={async () => {
              const service = await getService();
              await service.saveFleetEvaluationPolicy({
                brandId: brandId || undefined,
                healthyMin: policy?.healthyMin ?? 1000,
                isEnabled: true,
                metric,
                minPublishedPosts: policy?.minPublishedPosts ?? 8,
                watchMin: policy?.watchMin ?? 400,
                windowWeeks: Number(windowWeeks) || 4,
              });
            }}
          />
        </div>
      }
    >
      <Table
        columns={columns}
        emptyLabel="No connected accounts"
        getRowKey={(row) => row.identity.credentialId}
        getRowLink={(row) => ({
          href: `${APP_ROUTES.ANALYTICS.ACCOUNTS}/${row.identity.credentialId}`,
          label: row.identity.label || row.identity.externalHandle || 'Account',
        })}
        isLoading={isLoading}
        items={list?.accounts ?? []}
        label="Accounts"
      />
    </Container>
  );
}
