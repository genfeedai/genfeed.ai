'use client';

import {
  useAnalyticsContext,
  useAnalyticsToolbar,
} from '@contexts/analytics/analytics-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@contexts/user/brand-context/brand-context.helpers';
import {
  AccountEvaluationState,
  AnalyticsMetric,
  ButtonVariant,
  formatPlatformLabel,
} from '@genfeedai/contracts';
import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type {
  IAccountAnalytics,
  IAccountAnalyticsIdentity,
  IAccountAnalyticsList,
  IFleetEvaluationPolicy,
} from '@genfeedai/contracts/interfaces';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import AccountCell from '@pages/brands/components/integrations/AccountCell';
import type { TableColumn } from '@props/ui/display/table.props';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import AnalyticsFilterMenu from '@ui/analytics/analytics-filter-menu/AnalyticsFilterMenu';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import Badge from '@ui/display/badge/Badge';
import BrandAvatar from '@ui/display/brand-avatar/BrandAvatar';
import Table from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import FormSearchbar from '@ui/primitives/searchbar';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

const HEALTH_BADGES: Record<
  AccountEvaluationState,
  { label: string; variant: 'success' | 'warning' | 'error' | 'secondary' }
> = {
  [AccountEvaluationState.HEALTHY]: { label: 'Healthy', variant: 'success' },
  [AccountEvaluationState.INSUFFICIENT_DATA]: {
    label: 'Not enough data',
    variant: 'secondary',
  },
  [AccountEvaluationState.UNDERPERFORMING]: {
    label: 'Underperforming',
    variant: 'error',
  },
  [AccountEvaluationState.WATCH]: { label: 'Watch', variant: 'warning' },
};

const MANUAL_HEALTH_BADGE = {
  label: 'Manual',
  variant: 'secondary',
} as const;

function toConnection(
  identity: IAccountAnalyticsIdentity,
): BrandDetailSocialConnection {
  return {
    avatarUrl: identity.externalAvatar,
    credentialId: identity.credentialId,
    handle: identity.externalHandle,
    isConnected: identity.isConnected,
    label: identity.label,
    name: identity.externalName,
    platform: identity.platform,
  };
}

function metricLabel(
  account: IAccountAnalytics,
  metric: AnalyticsMetric,
): string {
  const value = account.metrics.find((item) => item.metric === metric);
  if (value?.availability !== 'observed' || value.change === null) {
    return '-';
  }
  return formatCompactNumberIntl(value.change);
}

export default function AnalyticsAccounts() {
  const translate = useTranslations('pages.analytics.accounts');
  const scope = useCollectionScope();
  const { brandId, organizationId } = scope;
  const isFetchReady = isCollectionFetchReady(scope);
  const { brands } = useBrand();
  const pathname = usePathname();
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const currentPage = Number(searchParams.get('page')) || 1;
  const { dateRange, refreshTrigger, triggerRefresh } = useAnalyticsContext();
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

  // `/:org/:brand/...` lists that brand's accounts only; `/:org/~/...` lists
  // every brand's, so only then does the Brand column say anything.
  const isBrandColumnVisible = !brandId;
  const brandLogoById = useMemo(
    () =>
      new Map(brands.map((brand) => [getBrandEntityId(brand), brand.logoUrl])),
    [brands],
  );

  // A new search or ranking can leave the URL page past the last page of the
  // new result set, so every change starts over at page 1.
  const resetPage = useCallback(() => {
    const params = new URLSearchParams(searchParamsString);
    if (!params.has('page')) {
      return;
    }
    params.delete('page');
    const query = params.toString();
    replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, replace, searchParamsString]);

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
            limit: ITEMS_PER_PAGE,
            metric,
            organizationId,
            page: currentPage,
            search: search || undefined,
            startDate,
          }),
          service.getFleetEvaluationPolicy({
            brandId: brandId || undefined,
            organizationId,
          }) as Promise<IFleetEvaluationPolicy>,
        ]);
        if (signal.aborted) {
          return;
        }
        if (currentPage > 1 && currentPage > accounts.totalPages) {
          resetPage();
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
      currentPage,
      dateRange.endDate,
      dateRange.startDate,
      getService,
      isFetchReady,
      metric,
      organizationId,
      resetPage,
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

  const accountToolbar = useMemo(() => {
    const facets: FilterMenuFacet[] = [
      {
        defaultValue: AnalyticsMetric.VIEWS,
        // Rank by orders the accounts, it does not narrow them.
        isCounted: false,
        key: 'metric',
        label: 'Rank by',
        onChange: (value) => {
          setMetric(value as AnalyticsMetric);
          resetPage();
        },
        options: [
          { label: translate('views'), value: AnalyticsMetric.VIEWS },
          { label: translate('followers'), value: AnalyticsMetric.FOLLOWERS },
          { label: translate('posts'), value: AnalyticsMetric.POSTS },
        ],
        selection: 'single',
        value: metric,
      },
    ];

    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <FormSearchbar
          ariaLabel="Search accounts"
          className="w-full sm:w-44"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            resetPage();
          }}
          placeholder="Search accounts"
        />
        <AnalyticsFilterMenu
          facets={facets}
          onClear={() => {
            setMetric(AnalyticsMetric.VIEWS);
            resetPage();
          }}
        />
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
    );
  }, [
    brandId,
    getService,
    metric,
    organizationId,
    policy,
    resetPage,
    search,
    translate,
    windowWeeks,
  ]);

  const hasAccountToolbar =
    Boolean(list?.accounts.length) || search.trim().length > 0;

  useAnalyticsToolbar(hasAccountToolbar ? accountToolbar : null);

  const columns: TableColumn<IAccountAnalytics>[] = useMemo(
    () => [
      {
        key: 'account',
        header: 'Account',
        render: (row) => (
          <AccountCell connection={toConnection(row.identity)} />
        ),
      },
      ...(isBrandColumnVisible
        ? [
            {
              key: 'brand',
              header: 'Brand',
              render: (row: IAccountAnalytics) =>
                row.identity.brandLabel ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <BrandAvatar
                      logoUrl={brandLogoById.get(row.identity.brandId)}
                      name={row.identity.brandLabel}
                      size="sm"
                    />
                    <span className="truncate text-sm">
                      {row.identity.brandLabel}
                    </span>
                  </span>
                ) : (
                  '-'
                ),
            },
          ]
        : []),
      {
        key: 'platform',
        header: 'Platform',
        render: (row) =>
          formatPlatformLabel(row.identity.platform) ?? row.identity.platform,
      },
      {
        key: 'posts',
        header: (
          <AnalyticsMetricLabel metric="posts">Posts</AnalyticsMetricLabel>
        ),
        render: (row) => String(row.publishedPosts),
      },
      {
        key: 'metric',
        header: (
          <AnalyticsMetricLabel metric={metric}>Metric</AnalyticsMetricLabel>
        ),
        render: (row) => metricLabel(row, metric),
      },
      {
        key: 'health',
        header: 'Health',
        render: (row) => {
          const badge =
            (row.evaluation && HEALTH_BADGES[row.evaluation.state]) ||
            MANUAL_HEALTH_BADGE;
          return <Badge variant={badge.variant}>{badge.label}</Badge>;
        },
      },
    ],
    [brandLogoById, isBrandColumnVisible, metric],
  );

  return (
    <>
      <Table
        ariaLabel="Accounts"
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
      <div className="mt-4">
        <AutoPagination showTotal totalLabel="accounts" />
      </div>
    </>
  );
}
