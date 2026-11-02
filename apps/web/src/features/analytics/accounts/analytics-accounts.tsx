'use client';

import {
  useAnalyticsContext,
  useAnalyticsSearch,
  useAnalyticsToolbar,
} from '@contexts/analytics/analytics-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@contexts/user/brand-context/brand-context.helpers';
import {
  AccountEvaluationState,
  AnalyticsMetric,
  ButtonVariant,
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
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { TableColumn } from '@props/ui/display/table.props';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import Table from '@ui/display/table/Table';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Avatar } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import SearchField from '@/components/content/search-field/SearchField';
import AccountCell from '@/features/brands/components/integrations/AccountCell';

type HealthBadgeLabelKey =
  | 'healthHealthy'
  | 'healthInsufficientData'
  | 'healthManual'
  | 'healthUnderperforming'
  | 'healthWatch';

const HEALTH_BADGES: Record<
  AccountEvaluationState,
  {
    labelKey: HealthBadgeLabelKey;
    variant: 'success' | 'warning' | 'destructive' | 'secondary';
  }
> = {
  [AccountEvaluationState.HEALTHY]: {
    labelKey: 'healthHealthy',
    variant: 'success',
  },
  [AccountEvaluationState.INSUFFICIENT_DATA]: {
    labelKey: 'healthInsufficientData',
    variant: 'secondary',
  },
  [AccountEvaluationState.UNDERPERFORMING]: {
    labelKey: 'healthUnderperforming',
    variant: 'destructive',
  },
  [AccountEvaluationState.WATCH]: {
    labelKey: 'healthWatch',
    variant: 'warning',
  },
};

const MANUAL_HEALTH_BADGE = {
  labelKey: 'healthManual',
  variant: 'secondary',
} as const;

const EVALUATION_WINDOW_WEEKS = [1, 2, 4, 8, 12] as const;
const DEFAULT_EVALUATION_WINDOW_WEEKS = 4;

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

function getAccountName(account: IAccountAnalytics): string {
  return (
    account.identity.label ||
    account.identity.externalHandle ||
    account.identity.externalName ||
    account.identity.credentialId
  );
}

export default function AnalyticsAccounts() {
  const translate = useTranslations('pages.analytics.accounts');
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const summaryT = useTranslations('ui.rowSidebar.analytics');
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
  const [windowWeeks, setWindowWeeks] = useState(
    String(DEFAULT_EVALUATION_WINDOW_WEEKS),
  );

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

  const changePage = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParamsString);
      if (page === 1) {
        params.delete('page');
      } else {
        params.set('page', String(page));
      }
      const query = params.toString();
      replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, replace, searchParamsString],
  );

  const { startDate, endDate } = getDateRangeWithDefaults(
    dateRange.startDate ?? undefined,
    dateRange.endDate ?? undefined,
  );
  const accountsQuery = useAuthedQuery({
    enabled: isFetchReady && Boolean(organizationId),
    // A new search, page or ranking keeps the current rows on screen until the
    // next page lands, within the same organization and brand only.
    keepPreviousDataWithin: [
      'analytics',
      'accounts',
      organizationId,
      brandId ?? null,
    ],
    queryFn: async (service) => {
      try {
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
        return { accounts, evaluationPolicy };
      } catch (requestError) {
        logger.error('Failed to fetch account analytics', requestError);
        throw requestError;
      }
    },
    queryKey: [
      'analytics',
      'accounts',
      organizationId,
      brandId ?? null,
      startDate,
      endDate,
      metric,
      search,
      currentPage,
    ],
    refreshKey: refreshTrigger,
    service: (token: string) => AnalyticsService.getInstance(token),
  });
  const list: IAccountAnalyticsList | null =
    accountsQuery.data?.accounts ?? null;
  const policy: IFleetEvaluationPolicy | null =
    accountsQuery.data?.evaluationPolicy ?? null;
  const isLoading = !isFetchReady || accountsQuery.isLoading;
  const error =
    accountsQuery.isError && !accountsQuery.data
      ? translate('loadError')
      : null;

  // The saved evaluation window seeds the weeks field once it is known.
  const policyWindowWeeks = policy?.windowWeeks;
  useEffect(() => {
    if (policyWindowWeeks) {
      setWindowWeeks(String(policyWindowWeeks));
    }
  }, [policyWindowWeeks]);

  // A smaller result set can leave the URL page past the last page.
  const totalPages = list?.totalPages;
  useEffect(() => {
    if (
      !accountsQuery.isPlaceholderData &&
      totalPages !== undefined &&
      currentPage > 1 &&
      currentPage > totalPages
    ) {
      resetPage();
    }
  }, [accountsQuery.isPlaceholderData, currentPage, resetPage, totalPages]);

  const accountFilterMenu = useMemo(() => {
    const facets: FilterMenuFacet[] = [
      {
        defaultValue: AnalyticsMetric.VIEWS,
        // Rank by orders the accounts, it does not narrow them.
        isCounted: false,
        key: 'metric',
        label: translate('rankByMetric'),
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
      {
        defaultValue: String(DEFAULT_EVALUATION_WINDOW_WEEKS),
        // The window is saved with the evaluation policy, it does not narrow
        // the list.
        isCounted: false,
        key: 'evaluationWindow',
        label: translate('evaluationWindow'),
        onChange: setWindowWeeks,
        options: [...new Set([...EVALUATION_WINDOW_WEEKS, Number(windowWeeks)])]
          .filter((weeks) => weeks > 0)
          .sort((left, right) => left - right)
          .map((weeks) => ({
            label: translate('evaluationWindowOption', { weeks }),
            value: String(weeks),
          })),
        selection: 'single',
        value: windowWeeks,
      },
    ];

    return (
      <FilterMenu
        facets={facets}
        isAttached
        onClear={() => {
          setMetric(AnalyticsMetric.VIEWS);
          setWindowWeeks(String(DEFAULT_EVALUATION_WINDOW_WEEKS));
          resetPage();
        }}
      />
    );
  }, [metric, resetPage, translate, windowWeeks]);

  const accountToolbar = useMemo(() => {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          label={translate('saveEvaluation')}
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
                windowWeeks:
                  Number(windowWeeks) || DEFAULT_EVALUATION_WINDOW_WEEKS,
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
    translate,
    windowWeeks,
  ]);

  const hasAccountToolbar =
    Boolean(list?.accounts.length) || search.trim().length > 0;

  const accountSearch = useMemo(
    () => (
      <SearchField
        ariaLabel={translate('searchAccounts')}
        onChange={(event) => {
          setSearch(event.target.value);
          resetPage();
        }}
        placeholder={translate('searchAccounts')}
        value={search}
      >
        {accountFilterMenu}
      </SearchField>
    ),
    [accountFilterMenu, resetPage, search, translate],
  );

  useAnalyticsToolbar(hasAccountToolbar ? accountToolbar : null);
  useAnalyticsSearch(hasAccountToolbar ? accountSearch : null);

  const columns: TableColumn<IAccountAnalytics>[] = useMemo(
    () => [
      {
        key: 'account',
        header: translate('account'),
        render: (row) => (
          <AccountCell connection={toConnection(row.identity)} />
        ),
      },
      ...(isBrandColumnVisible
        ? [
            {
              key: 'brand',
              header: translate('brand'),
              render: (row: IAccountAnalytics) =>
                row.identity.brandLabel ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar
                      alt={row.identity.brandLabel}
                      name={row.identity.brandLabel}
                      shape="square"
                      size="sm"
                      src={brandLogoById.get(row.identity.brandId)}
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
        key: 'posts',
        header: (
          <AnalyticsMetricLabel metric="posts">
            {translate('posts')}
          </AnalyticsMetricLabel>
        ),
        render: (row) => String(row.publishedPosts),
      },
      {
        key: 'metric',
        header: (
          <AnalyticsMetricLabel metric={metric}>
            {translate('metric')}
          </AnalyticsMetricLabel>
        ),
        render: (row) => metricLabel(row, metric),
      },
      {
        key: 'health',
        header: translate('health'),
        render: (row) => {
          const badge =
            (row.evaluation && HEALTH_BADGES[row.evaluation.state]) ||
            MANUAL_HEALTH_BADGE;
          return (
            <Badge variant={badge.variant}>{translate(badge.labelKey)}</Badge>
          );
        },
      },
    ],
    [brandLogoById, isBrandColumnVisible, metric, translate],
  );

  return (
    <>
      <Table
        ariaLabel={translate('accounts')}
        error={error ? { title: error, onRetry: triggerRefresh } : undefined}
        columns={columns}
        emptyLabel={translate('noConnectedAccounts')}
        getRowKey={(row) => row.identity.credentialId}
        getRowLink={(row) => ({
          href: `${APP_ROUTES.ANALYTICS.ACCOUNTS}/${row.identity.credentialId}`,
          label:
            row.identity.label ||
            row.identity.externalHandle ||
            translate('account'),
        })}
        isLoading={isLoading}
        items={list?.accounts ?? []}
        rowSidebar={{
          getId: (row) => row.identity.credentialId,
          getSubtitle: (row) => row.identity.platform,
          getTitle: getAccountName,
          kind: 'account',
          render: (row) => (
            <TableRowSummary
              facts={[
                {
                  id: 'handle',
                  label: fieldsT('handle'),
                  value: row.identity.externalHandle,
                },
                {
                  id: 'brand',
                  label: fieldsT('brand'),
                  value: row.identity.brandLabel,
                },
                {
                  id: 'platform',
                  label: fieldsT('platform'),
                  value: row.identity.platform,
                },
                {
                  id: 'posts',
                  label: translate('posts'),
                  value: String(row.publishedPosts),
                },
                {
                  id: 'metric',
                  label: translate(metric),
                  value: metricLabel(row, metric),
                },
                {
                  id: 'health',
                  label: fieldsT('health'),
                  value: row.evaluation?.state ?? summaryT('manual'),
                },
              ]}
              openHref={`${APP_ROUTES.ANALYTICS.ACCOUNTS}/${row.identity.credentialId}`}
              openLabel={summaryT('openAccount')}
            />
          ),
        }}
      />
      <div className="mt-4">
        <Pagination
          currentPage={list?.page ?? currentPage}
          onPageChange={changePage}
          totalItems={list?.total}
          totalLabel="accounts"
          totalPages={list?.totalPages ?? 1}
        />
      </div>
    </>
  );
}
