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
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { TableColumn } from '@props/ui/display/table.props';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import Table from '@ui/display/table/Table';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
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
  const translate = useTranslations('pages.analytics.accounts');
  const scope = useCollectionScope();
  const { brandId, organizationId } = scope;
  const isFetchReady = isCollectionFetchReady(scope);
  const { dateRange, setToolbarNode, refreshTrigger, triggerRefresh } =
    useAnalyticsContext();
  const getService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );
  const [search, setSearch] = useState('');
  const [metric, setMetric] = useState<AnalyticsMetric>(AnalyticsMetric.VIEWS);
  const [list, setList] = useState<IAccountAnalyticsList | null>(null);
  const [policy, setPolicy] = useState<IFleetEvaluationPolicy | null>(null);
  const [windowWeeks, setWindowWeeks] = useState('4');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!isFetchReady || !organizationId) {
        return;
      }

      setError(null);
      try {
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
            organizationId,
            search: search || undefined,
            startDate,
          }) as Promise<IAccountAnalyticsList>,
          service.getFleetEvaluationPolicy({
            brandId: brandId || undefined,
            organizationId,
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
      } catch (requestError) {
        if (!signal.aborted) {
          logger.error('Failed to fetch account analytics', requestError);
          setError(translate('loadError'));
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [
      brandId,
      dateRange.endDate,
      dateRange.startDate,
      getService,
      isFetchReady,
      metric,
      organizationId,
      search,
      translate,
    ],
  );

  useEffect(() => {
    if (!isFetchReady || refreshTrigger < 0) {
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    void load(controller.signal);
    return () => controller.abort();
  }, [isFetchReady, load, refreshTrigger]);

  const accountToolbar = useMemo(
    () => (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <FormSearchbar
          ariaLabel="Search accounts"
          className="w-full sm:w-44"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search accounts"
        />
        <Select
          value={metric}
          onValueChange={(value) => setMetric(value as AnalyticsMetric)}
        >
          <SelectTrigger aria-label="Rank by metric" className="h-9 w-32">
            <SelectValue placeholder="Metric" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AnalyticsMetric.VIEWS}>
              {translate('views')}
            </SelectItem>
            <SelectItem value={AnalyticsMetric.FOLLOWERS}>
              {translate('followers')}
            </SelectItem>
            <SelectItem value={AnalyticsMetric.POSTS}>
              {translate('posts')}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          aria-label="Evaluation weeks"
          className="h-9 w-20"
          min={1}
          placeholder="Weeks"
          type="number"
          value={windowWeeks}
          onChange={(event) => setWindowWeeks(event.target.value)}
        />
        <Button
          label="Save evaluation"
          variant={ButtonVariant.SECONDARY}
          onClick={async () => {
            if (!organizationId) {
              return;
            }
            const service = await getService();
            await service.saveFleetEvaluationPolicy(
              {
                brandId: brandId || undefined,
                healthyMin: policy?.healthyMin ?? 1000,
                isEnabled: true,
                metric,
                minPublishedPosts: policy?.minPublishedPosts ?? 8,
                watchMin: policy?.watchMin ?? 400,
                windowWeeks: Number(windowWeeks) || 4,
              },
              { organizationId },
            );
          }}
        />
      </div>
    ),
    [
      brandId,
      getService,
      metric,
      organizationId,
      policy,
      search,
      translate,
      windowWeeks,
    ],
  );

  const hasAccountToolbar =
    Boolean(list?.accounts.length) || search.trim().length > 0;

  useEffect(() => {
    setToolbarNode(hasAccountToolbar ? accountToolbar : null);
    return () => setToolbarNode(null);
  }, [accountToolbar, hasAccountToolbar, setToolbarNode]);

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
    <Table
      error={error ? { title: error, onRetry: triggerRefresh } : undefined}
      columns={columns}
      emptyLabel="No connected accounts"
      getRowKey={(row) => row.identity.credentialId}
      getRowLink={(row) => ({
        href: `${APP_ROUTES.ANALYTICS.ACCOUNTS}/${row.identity.credentialId}`,
        label: row.identity.label || row.identity.externalHandle || 'Account',
      })}
      isLoading={isLoading}
      items={list?.accounts ?? []}
    />
  );
}
