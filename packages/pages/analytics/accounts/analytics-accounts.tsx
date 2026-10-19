'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
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
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import Badge from '@ui/display/badge/Badge';
import BrandAvatar from '@ui/display/brand-avatar/BrandAvatar';
import Table from '@ui/display/table/Table';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
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
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
    variant: 'success' | 'warning' | 'error' | 'secondary';
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
    variant: 'error',
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

  const accountToolbar = useMemo(
    () => (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <FormSearchbar
          ariaLabel={translate('searchAccounts')}
          className="w-full sm:w-44"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            resetPage();
          }}
          placeholder={translate('searchAccounts')}
        />
        <Select
          value={metric}
          onValueChange={(value) => {
            setMetric(value as AnalyticsMetric);
            resetPage();
          }}
        >
          <SelectTrigger
            aria-label={translate('rankByMetric')}
            className="h-9 w-32"
          >
            <SelectValue placeholder={translate('metric')} />
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
          aria-label={translate('evaluationWeeks')}
          className="h-9 w-20"
          min={1}
          placeholder={translate('weeks')}
          type="number"
          value={windowWeeks}
          onChange={(event) => setWindowWeeks(event.target.value)}
        />
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
      resetPage,
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
        header: translate('platform'),
        render: (row) =>
          formatPlatformLabel(row.identity.platform) ?? row.identity.platform,
      },
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
        <AutoPagination showTotal totalLabel="accounts" />
      </div>
    </>
  );
}
