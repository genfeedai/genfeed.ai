'use client';

import ConciergeHandoff from '@app/(protected)/admin/organizations/components/concierge/concierge-handoff';
import OrganizationSidebarActivity from '@app/(protected)/admin/organizations/components/organization-sidebar-activity';
import {
  useAnalyticsContext,
  useAnalyticsSearch,
} from '@contexts/analytics/analytics-context';
import {
  AnalyticsMetric,
  ButtonSize,
  ButtonVariant,
  OrganizationCategory,
  OrganizationLifecycleStatus,
  OrganizationSourceFilter,
} from '@genfeedai/contracts';
import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IWarmupAccount } from '@genfeedai/contracts/interfaces';
import {
  formatCompactNumberIntl,
  formatPercentageSimple,
} from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import {
  AnalyticsService,
  type IOrgWithStats,
  type IPaginatedOrgsResponse,
} from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import AppTable from '@ui/display/table/Table';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import TableUserCell from '@ui/display/table/TableUserCell';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import { Badge } from '@ui/primitives/badge';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { Button } from '@ui/primitives/button';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import SearchField from '@/components/content/search-field/SearchField';
import type { AnalyticsOrganizationsListProps } from '@/features/admin/props/analytics.props';
import { useDebounce } from '@/hooks/utils/use-debounce/use-debounce';

const SEARCH_DEBOUNCE_MS = 300;
const ALL_TYPES = 'all';

const GENERATIONS_SORT = 'generations';
const ALL_EMAIL_CLASSES = 'all';
const ALL_USAGE = 'all';
const ALL_STATUSES = 'all';
const ALL_SOURCES = 'all';

type OrganizationSortMetric =
  | AnalyticsMetric.ENGAGEMENT
  | AnalyticsMetric.VIEWS
  | AnalyticsMetric.POSTS
  | typeof GENERATIONS_SORT;

/** The columns the API can order by, and the metric each one stands for. */
const SORT_METRIC_BY_COLUMN: Record<string, OrganizationSortMetric> = {
  totalEngagement: AnalyticsMetric.ENGAGEMENT,
  totalGenerations: GENERATIONS_SORT,
  totalPosts: AnalyticsMetric.POSTS,
  totalViews: AnalyticsMetric.VIEWS,
};
const SORT_COLUMN_BY_METRIC: Record<OrganizationSortMetric, string> = {
  [AnalyticsMetric.ENGAGEMENT]: 'totalEngagement',
  [GENERATIONS_SORT]: 'totalGenerations',
  [AnalyticsMetric.POSTS]: 'totalPosts',
  [AnalyticsMetric.VIEWS]: 'totalViews',
};

export default function AnalyticsOrganizationsList({
  getReleaseAccessHref,
}: AnalyticsOrganizationsListProps) {
  const translate = useTranslations('pages.adminOrganizations');
  const rowSidebarT = useTranslations('ui.rowSidebar');
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const analyticsT = useTranslations('ui.rowSidebar.analytics');
  const kpiT = useTranslations('pages.analytics.brandsList.kpi');
  const metricT = useTranslations('pages.analytics.metricLabels');
  const { dateRange, filters, refreshTrigger, setFilter } =
    useAnalyticsContext();

  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const [data, setData] = useState<IPaginatedOrgsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<OrganizationSortMetric>(
    AnalyticsMetric.ENGAGEMENT,
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [type, setType] = useState<string>(ALL_TYPES);
  const [emailClass, setEmailClass] = useState<string>(ALL_EMAIL_CLASSES);
  const [usage, setUsage] = useState<string>(ALL_USAGE);
  const [status, setStatus] = useState<string>(ALL_STATUSES);
  const [source, setSource] = useState<string>(ALL_SOURCES);

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
            order: sortDirection,
            ...(debouncedSearchTerm ? { search: debouncedSearchTerm } : {}),
            sort,
            startDate: format(dateRange.startDate as Date, 'yyyy-MM-dd'),
            ...(type !== ALL_TYPES
              ? { type: type as OrganizationCategory }
              : {}),
            ...(emailClass !== ALL_EMAIL_CLASSES
              ? { emailClass: emailClass as 'company' | 'personal' }
              : {}),
            ...(usage !== ALL_USAGE
              ? { usage: usage as 'active' | 'inactive' }
              : {}),
            ...(status !== ALL_STATUSES
              ? { status: status as OrganizationLifecycleStatus }
              : {}),
            ...(source !== ALL_SOURCES
              ? { source: source as OrganizationSourceFilter }
              : {}),
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
    sortDirection,
    type,
    emailClass,
    usage,
    status,
    source,
    debouncedSearchTerm,
    refreshTrigger,
  ]);

  // A new search can leave the page past the last page of the new result set.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on search only
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm]);

  // A header click: the API orders by the clicked metric.
  const handleSortChange = useCallback(
    (columnKey: string, direction: 'asc' | 'desc') => {
      const metric = SORT_METRIC_BY_COLUMN[columnKey];
      if (!metric) {
        return;
      }
      setSort(metric);
      setSortDirection(direction);
      setPage(1);
    },
    [],
  );

  const handleTypeChange = useCallback((value: string) => {
    setType(value);
    setPage(1);
  }, []);

  const handleEmailClassChange = useCallback((value: string) => {
    setEmailClass(value);
    setPage(1);
  }, []);

  const handleUsageChange = useCallback((value: string) => {
    setUsage(value);
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((value: string) => {
    setStatus(value);
    setPage(1);
  }, []);

  const handleSourceChange = useCallback((value: string) => {
    setSource(value);
    setPage(1);
  }, []);

  // The stage follows the sidebar: sending an invitation moves the badge in the row.
  const handleConciergeChange = useCallback(
    (organizationId: string, stage: IWarmupAccount['status']) => {
      setData((current) =>
        current
          ? {
              ...current,
              data: current.data.map((org) =>
                org.id === organizationId && org.concierge
                  ? { ...org, concierge: { ...org.concierge, status: stage } }
                  : org,
              ),
            }
          : current,
      );
    },
    [],
  );

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
              defaultValue: ALL_STATUSES,
              key: 'status',
              label: translate('statusFilterLabel'),
              onChange: handleStatusChange,
              options: [
                { label: translate('allStatuses'), value: ALL_STATUSES },
                ...Object.values(OrganizationLifecycleStatus).map((value) => ({
                  label: translate(`statuses.${value}`),
                  value,
                })),
              ],
              selection: 'single',
              value: status,
            },
            {
              defaultValue: ALL_SOURCES,
              key: 'source',
              label: translate('sourceFilterLabel'),
              onChange: handleSourceChange,
              options: [
                { label: translate('allSources'), value: ALL_SOURCES },
                ...Object.values(OrganizationSourceFilter).map((value) => ({
                  label: translate(`sources.${value}`),
                  value,
                })),
              ],
              selection: 'single',
              value: source,
            },
            {
              defaultValue: ALL_TYPES,
              key: 'type',
              label: translate('typeLabel'),
              onChange: handleTypeChange,
              options: [
                { label: translate('allTypes'), value: ALL_TYPES },
                ...Object.values(OrganizationCategory).map((value) => ({
                  label: translate(`types.${value}`),
                  value,
                })),
              ],
              selection: 'single',
              value: type,
            },
            {
              defaultValue: ALL_EMAIL_CLASSES,
              key: 'emailClass',
              label: translate('emailClassFilterLabel'),
              onChange: handleEmailClassChange,
              options: [
                {
                  label: translate('allEmailClasses'),
                  value: ALL_EMAIL_CLASSES,
                },
                {
                  label: translate('emailClasses.company'),
                  value: 'company',
                },
                {
                  label: translate('emailClasses.personal'),
                  value: 'personal',
                },
              ],
              selection: 'single',
              value: emailClass,
            },
            {
              defaultValue: ALL_USAGE,
              key: 'usage',
              label: translate('usageFilterLabel'),
              onChange: handleUsageChange,
              options: [
                { label: translate('allUsage'), value: ALL_USAGE },
                { label: translate('usage.active'), value: 'active' },
                { label: translate('usage.inactive'), value: 'inactive' },
              ],
              selection: 'single',
              value: usage,
            },
          ]}
          isAttached
          onClear={() => {
            handleTypeChange(ALL_TYPES);
            handleEmailClassChange(ALL_EMAIL_CLASSES);
            handleUsageChange(ALL_USAGE);
            handleStatusChange(ALL_STATUSES);
            handleSourceChange(ALL_SOURCES);
          }}
        />
      </SearchField>
    ),
    [
      searchTerm,
      setFilter,
      type,
      emailClass,
      usage,
      status,
      source,
      handleTypeChange,
      handleEmailClassChange,
      handleUsageChange,
      handleStatusChange,
      handleSourceChange,
      translate,
    ],
  );

  useAnalyticsSearch(search);

  const orgs = data?.data || [];
  const pagination = data?.pagination;

  // A work address is the lead signal, so it is the one that is coloured.
  const renderEmailClassBadge = useCallback(
    (ownerEmailClass: IOrgWithStats['ownerEmailClass']) =>
      ownerEmailClass === 'company' ? (
        <Badge variant="success">{translate('emailClasses.company')}</Badge>
      ) : ownerEmailClass === 'personal' ? (
        <Badge variant="outline">{translate('emailClasses.personal')}</Badge>
      ) : (
        <Badge variant="outline">{translate('emailClasses.unknown')}</Badge>
      ),
    [translate],
  );

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
            <BrandAvatar
              alt={org.name || 'Organization'}
              name={org.name || 'Unknown'}
              size="md"
              src={org.logo}
            />
            <span className="font-medium">{org.name || 'Unknown'}</span>
            {org.concierge ? (
              <Badge status={org.concierge.status.toLowerCase()} />
            ) : null}
          </Link>
        ),
      },
      {
        header: translate('statusColumn'),
        key: 'status',
        render: (org) => <Badge status={org.status} />,
      },
      {
        header: translate('ownerColumn'),
        key: 'owner',
        render: (org) =>
          org.owner ? (
            <TableUserCell
              avatar={org.owner.avatar}
              email={org.owner.email}
              href={`${APP_ROUTES.ADMIN.USERS}/${org.owner.id}`}
              linkLabel={translate('ownerLinkLabel', { name: org.owner.name })}
              name={org.owner.name}
            />
          ) : (
            <span className="text-foreground/40">{translate('noOwner')}</span>
          ),
      },
      {
        header: translate('emailColumn'),
        key: 'ownerEmailClass',
        render: (org) => renderEmailClassBadge(org.ownerEmailClass),
      },
      {
        header: translate('typeColumn'),
        key: 'type',
        render: (org) => (
          <Badge variant="outline">
            {org.type
              ? translate(`types.${org.type}`)
              : translate('typeNotSet')}
          </Badge>
        ),
      },
      {
        className: 'text-right',
        header: translate('generationsColumn'),
        key: 'totalGenerations',
        render: (org) => (
          <span className="font-mono">
            {org.totalGenerations.toLocaleString('en-US')}
          </span>
        ),
        sortable: true,
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
        sortable: true,
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
        sortable: true,
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
        sortable: true,
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
    ],
    [renderEmailClassBadge, translate],
  );

  const actions = useMemo<TableAction<IOrgWithStats>[]>(
    () =>
      getReleaseAccessHref
        ? [
            {
              ariaLabel: (org) =>
                translate('releaseAccessLinkLabel', {
                  name: org.name || rowSidebarT('unknown'),
                }),
              href: (org) => getReleaseAccessHref(org.id),
              icon: <KeyRound />,
              tooltip: translate('releaseAccess'),
            },
          ]
        : [],
    [getReleaseAccessHref, rowSidebarT, translate],
  );

  return (
    <div className="flex flex-col gap-4">
      <KPISection
        size="sm"
        gridCols={{ desktop: 4, mobile: 1 }}
        isLoading={isLoading}
        items={[
          {
            label: kpiT('organizations'),
            value: formatCompactNumberIntl(pagination?.total ?? 0),
          },
          {
            analyticsMetric: 'posts',
            label: metricT('posts'),
            value: formatCompactNumberIntl(data?.totals?.totalPosts ?? 0),
          },
          {
            analyticsMetric: 'views',
            label: metricT('views'),
            value: formatCompactNumberIntl(data?.totals?.totalViews ?? 0),
          },
          {
            analyticsMetric: 'engagement',
            label: metricT('engagement'),
            trend: data?.totals?.growth,
            trendLabel: kpiT('vsLastPeriod'),
            value: formatCompactNumberIntl(data?.totals?.totalEngagement ?? 0),
          },
        ]}
      />
      <AppTable<IOrgWithStats>
        actions={actions}
        items={orgs}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(org) => org.id}
        onSortChange={handleSortChange}
        sortDirection={sortDirection}
        sortKey={SORT_COLUMN_BY_METRIC[sort]}
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
              badges={
                <>
                  <Badge status={org.status} />
                  {renderEmailClassBadge(org.ownerEmailClass)}
                  <Badge variant="outline">
                    {org.type
                      ? translate(`types.${org.type}`)
                      : translate('typeNotSet')}
                  </Badge>
                </>
              }
              facts={[
                {
                  id: 'owner',
                  label: translate('ownerLabel'),
                  value: org.owner ? (
                    <Link
                      className="hover:text-primary"
                      href={`${APP_ROUTES.ADMIN.USERS}/${org.owner.id}`}
                    >
                      {org.owner.name}
                    </Link>
                  ) : undefined,
                },
                {
                  id: 'email',
                  label: translate('emailLabel'),
                  value: org.owner?.email,
                },
                { id: 'plan', label: translate('planLabel'), value: org.plan },
                { id: 'slug', label: translate('slugLabel'), value: org.slug },
                {
                  id: 'generations',
                  label: translate('generationsLabel'),
                  value: org.totalGenerations.toLocaleString('en-US'),
                },
                {
                  id: 'lastActive',
                  label: translate('lastActiveLabel'),
                  value: org.lastActiveAt
                    ? format(new Date(org.lastActiveAt), 'MMM d, yyyy')
                    : translate('neverActive'),
                },
                {
                  id: 'created',
                  label: translate('createdLabel'),
                  value: org.createdAt
                    ? format(new Date(org.createdAt), 'MMM d, yyyy')
                    : undefined,
                },
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
            >
              <OrganizationSidebarActivity organizationId={org.id} />
              <div className="flex flex-wrap gap-2">
                {org.owner ? (
                  <Button
                    asChild
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                  >
                    <Link href={`${APP_ROUTES.ADMIN.USERS}/${org.owner.id}`}>
                      {translate('openOwner')}
                    </Link>
                  </Button>
                ) : null}
                {getReleaseAccessHref ? (
                  <Button
                    asChild
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                  >
                    <Link href={getReleaseAccessHref(org.id)}>
                      {translate('releaseAccess')}
                    </Link>
                  </Button>
                ) : null}
              </div>
              {org.concierge ? (
                <ConciergeHandoff
                  conciergeId={org.concierge.id}
                  onAccountChange={(account) =>
                    handleConciergeChange(org.id, account.status)
                  }
                  ownerName={org.owner?.name}
                />
              ) : null}
            </TableRowSummary>
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
