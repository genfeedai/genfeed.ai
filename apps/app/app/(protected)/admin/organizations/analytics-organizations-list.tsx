'use client';

import {
  useAnalyticsContext,
  useAnalyticsSearch,
} from '@contexts/analytics/analytics-context';
import {
  AnalyticsMetric,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/contracts';
import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { formatPercentageSimple } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useDebounce } from '@hooks/utils/use-debounce/use-debounce';
import type { TableColumn } from '@props/ui/display/table.props';
import {
  AnalyticsService,
  type IOrgWithStats,
  type IPaginatedOrgsResponse,
} from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import SearchField from '@ui/content/search-field/SearchField';
import AppTable from '@ui/display/table/Table';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnalyticsOrganizationsListProps } from '@/features/admin/props/analytics.props';

const SEARCH_DEBOUNCE_MS = 300;

export default function AnalyticsOrganizationsList({
  getReleaseAccessHref,
}: AnalyticsOrganizationsListProps) {
  const translate = useTranslations('pages.adminOrganizations');
  const rowSidebarT = useTranslations('ui.rowSidebar');
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const analyticsT = useTranslations('ui.rowSidebar.analytics');
  const { dateRange, filters, refreshTrigger, setFilter } =
    useAnalyticsContext();

  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const [data, setData] = useState<IPaginatedOrgsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<
    AnalyticsMetric.ENGAGEMENT | AnalyticsMetric.VIEWS | AnalyticsMetric.POSTS
  >(AnalyticsMetric.ENGAGEMENT);

  const isLoading = data === null;
  const searchTerm = filters.query ?? '';
  // The API searches, so a keystroke must not cost a request.
  const debouncedSearchTerm = useDebounce(searchTerm, SEARCH_DEBOUNCE_MS);

  // `refreshTrigger` is the refresh button's nonce: pressing it refetches.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (!dateRange.startDate || !dateRange.endDate) {
      return;
    }

    const controller = new AbortController();
    const fetchData = async () => {
      try {
        const service = await getAnalyticsService();
        const response = await service.getOrganizationsWithStats(
          {
            endDate: format(dateRange.endDate as Date, 'yyyy-MM-dd'),
            limit: ITEMS_PER_PAGE,
            page,
            ...(debouncedSearchTerm ? { search: debouncedSearchTerm } : {}),
            sort,
            startDate: format(dateRange.startDate as Date, 'yyyy-MM-dd'),
          },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setData(response);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to fetch organizations', error);
        }
      }
    };

    void fetchData();
    return () => controller.abort();
  }, [
    getAnalyticsService,
    dateRange,
    page,
    sort,
    debouncedSearchTerm,
    refreshTrigger,
  ]);

  // A new search can leave the page past the last page of the new result set.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on search only
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm]);

  const handleSortChange = useCallback((value: string) => {
    setSort(
      value as
        | AnalyticsMetric.ENGAGEMENT
        | AnalyticsMetric.VIEWS
        | AnalyticsMetric.POSTS,
    );
    setPage(1);
  }, []);

  const search = useMemo(
    () => (
      <SearchField
        ariaLabel={translate('searchLabel')}
        onChange={(event) => setFilter('query', event.target.value)}
        placeholder={translate('searchPlaceholder')}
        value={searchTerm}
      >
        <FilterMenu
          facets={[
            {
              defaultValue: AnalyticsMetric.ENGAGEMENT,
              // Sort orders the list, it does not narrow it.
              isCounted: false,
              key: 'sort',
              label: 'Sort by',
              onChange: handleSortChange,
              options: [
                { label: 'Engagement', value: AnalyticsMetric.ENGAGEMENT },
                { label: 'Views', value: AnalyticsMetric.VIEWS },
                { label: 'Posts', value: AnalyticsMetric.POSTS },
              ],
              selection: 'single',
              value: sort,
            },
          ]}
          isAttached
          onClear={() => handleSortChange(AnalyticsMetric.ENGAGEMENT)}
        />
      </SearchField>
    ),
    [searchTerm, setFilter, sort, handleSortChange, translate],
  );

  useAnalyticsSearch(search);

  const orgs = data?.data || [];
  const pagination = data?.pagination;

  const columns: TableColumn<IOrgWithStats>[] = useMemo(
    () => [
      {
        header: 'Organization',
        key: 'name',
        render: (org) => (
          <Link
            href={`${APP_ROUTES.ADMIN.ORGANIZATIONS}/${org.id}`}
            className="flex items-center gap-3 hover:text-primary"
          >
            <Avatar className="size-8">
              {org.logo ? (
                <AvatarImage alt={org.name || 'Organization'} src={org.logo} />
              ) : null}
              <AvatarFallback className="text-sm font-medium">
                {(org.name || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">{org.name || 'Unknown'}</span>
          </Link>
        ),
      },
      {
        header: translate('ownerColumn'),
        key: 'owner',
        render: (org) =>
          org.owner ? (
            <Link
              aria-label={translate('ownerLinkLabel', { name: org.owner.name })}
              className="flex items-center gap-2 hover:text-primary"
              href={`${APP_ROUTES.ADMIN.ADMINISTRATION.USERS}/${org.owner.id}`}
            >
              <Avatar className="size-6">
                {org.owner.avatar ? (
                  <AvatarImage alt={org.owner.name} src={org.owner.avatar} />
                ) : null}
                <AvatarFallback className="text-2xs font-semibold">
                  {org.owner.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{org.owner.name}</span>
            </Link>
          ) : (
            <span className="text-foreground/40">{translate('noOwner')}</span>
          ),
      },
      {
        className: 'text-right',
        header: 'Posts',
        key: 'totalPosts',
        render: (org) => (
          <span className="font-mono">
            {org.totalPosts.toLocaleString('en-US')}
          </span>
        ),
      },
      {
        className: 'text-right',
        header: 'Engagement',
        key: 'totalEngagement',
        render: (org) => (
          <span className="font-mono">
            {org.totalEngagement.toLocaleString('en-US')}
          </span>
        ),
      },
      {
        className: 'text-right',
        header: 'Views',
        key: 'totalViews',
        render: (org) => (
          <span className="font-mono">
            {org.totalViews.toLocaleString('en-US')}
          </span>
        ),
      },
      {
        className: 'text-right',
        header: 'Brands',
        key: 'totalBrands',
        render: (org) => <span className="font-mono">{org.totalBrands}</span>,
      },
      {
        className: 'text-right',
        header: 'Growth',
        key: 'growth',
        render: (org) => (
          <span
            className={`font-mono ${
              org.growth > 0
                ? 'text-success'
                : org.growth < 0
                  ? 'text-destructive'
                  : 'text-foreground/60'
            }`}
          >
            {org.growth > 0 ? '+' : ''}
            {org.growth.toFixed(1)}%
          </span>
        ),
      },
      {
        className: 'text-right',
        header: 'Members',
        key: 'totalMembers',
        render: (org) => <span className="font-mono">{org.totalMembers}</span>,
      },
      ...(getReleaseAccessHref
        ? [
            {
              className: 'text-right',
              header: translate('releaseAccessColumn'),
              key: 'releaseAccess',
              render: (org: IOrgWithStats) => (
                <Button
                  asChild
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                >
                  <Link
                    aria-label={translate('releaseAccessLinkLabel', {
                      name: org.name || rowSidebarT('unknown'),
                    })}
                    href={getReleaseAccessHref(org.id)}
                  >
                    {translate('releaseAccessLink')}
                  </Link>
                </Button>
              ),
            },
          ]
        : []),
    ],
    [getReleaseAccessHref, rowSidebarT, translate],
  );

  return (
    <div className="flex flex-col gap-4">
      <AppTable<IOrgWithStats>
        items={orgs}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(org) => org.id}
        emptyLabel={
          searchTerm ? translate('emptySearch') : 'No organizations found'
        }
        rowSidebar={{
          getId: (org) => org.id,
          getSubtitle: (org) =>
            analyticsT('brandCount', { count: org.totalBrands }),
          getTitle: (org) => org.name || rowSidebarT('unknown'),
          kind: 'organization',
          render: (org) => (
            <TableRowSummary
              facts={[
                {
                  id: 'brands',
                  label: fieldsT('brands'),
                  value: org.totalBrands,
                },
                {
                  id: 'members',
                  label: fieldsT('members'),
                  value: org.totalMembers,
                },
                {
                  id: 'posts',
                  label: fieldsT('posts'),
                  value: org.totalPosts.toLocaleString('en-US'),
                },
                {
                  id: 'views',
                  label: fieldsT('views'),
                  value: org.totalViews.toLocaleString('en-US'),
                },
                {
                  id: 'engagement',
                  label: fieldsT('engagement'),
                  value: org.totalEngagement.toLocaleString('en-US'),
                },
                {
                  id: 'engagementRate',
                  label: fieldsT('engagementRate'),
                  value: formatPercentageSimple(org.avgEngagementRate, 2),
                },
                {
                  id: 'growth',
                  label: fieldsT('growth'),
                  value: `${org.growth > 0 ? '+' : ''}${org.growth.toFixed(1)}%`,
                },
              ]}
              openHref={`${APP_ROUTES.ADMIN.ORGANIZATIONS}/${org.id}`}
              openLabel={analyticsT('openOrganization')}
            />
          ),
        }}
      />

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-foreground/60">
            Showing {(page - 1) * pagination.limit + 1} -{' '}
            {Math.min(page * pagination.limit, pagination.total)} of{' '}
            {pagination.total}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              isDisabled={page === 1}
              onClick={() => setPage((prev) => prev - 1)}
              icon={<ChevronLeft className="size-4" />}
            />
            <span className="text-sm">
              Page {page} of {pagination.totalPages}
            </span>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              isDisabled={page === pagination.totalPages}
              onClick={() => setPage((prev) => prev + 1)}
              icon={<ChevronRight className="size-4" />}
            />
          </div>
        </div>
      )}
    </div>
  );
}
