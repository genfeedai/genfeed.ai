'use client';

import {
  ActivityKey,
  ButtonSize,
  ButtonVariant,
  formatActivityMessage,
  type IngredientCategory,
  PageScope,
} from '@genfeedai/contracts';
import type { IActivity, IIngredient } from '@genfeedai/contracts/interfaces';
import { getPostsPlatformLabel } from '@helpers/content/posts.helper';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TableAction } from '@props/ui/display/table.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AppTable from '@ui/display/table/Table';
import TableGroupHeading from '@ui/display/table/TableGroupHeading';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { ArrowUpRight, ClipboardList, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import type { ActivitiesListProps } from '@/features/activities/props/activities.props';
import { useActivities } from '@/hooks/data/activities/use-activities/use-activities';
import { useIngredientSidebar } from '@/hooks/ui/ingredient/use-ingredient-sidebar/use-ingredient-sidebar';

import {
  formatActivityClock,
  formatActivityDayHeading,
  getActivityCreditsDelta,
  getActivityDayKey,
  getActivityDescription,
  getActivityDestinationPath,
  getActivityDetailText,
  getActivityIngredientPreviewUrl,
  getActivityLifecycleText,
  getActivityRunDuration,
  getActivityStatus,
  getBackgroundTaskStatus,
  getResultTypeFromActivityKey,
  isBackgroundTask,
  parseActivityValue,
  parsePostActivityValue,
} from './activities-list.utils';
import ActivityDetailPanel from './components/ActivityDetailPanel';
import ActivityStatusCell from './components/ActivityStatusCell';
import ActivityThumbnailCell from './components/ActivityThumbnailCell';

/** The live post behind a published-post activity, when it carries one. */
function getPublishedPostLink(activity: IActivity) {
  if (activity.key !== ActivityKey.POST_PUBLISHED || !activity.value) {
    return undefined;
  }
  const postInfo = parsePostActivityValue(activity.value);
  return postInfo?.url && postInfo.platform
    ? { platform: postInfo.platform, url: postInfo.url }
    : undefined;
}

export default function ActivitiesList({
  activityMessageFormatter = formatActivityMessage,
  scope,
}: ActivitiesListProps) {
  const translate = useTranslations('pages.activities');
  const translateGenerationFailure = useTranslations(
    'common.notificationInbox.generationFailureReasons',
  );
  const searchParams = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  const { search, setSearch } = useAdminSearchParam();

  const {
    isLoading,
    isError,
    isRefreshing,
    refresh,
    filteredActivities,
    pageTotals,
    markActivitiesAsRead,
    toggleActivityRead,
  } = useActivities({ limit: 20, page, scope, search });

  const { href } = useOrgUrl();
  const { openIngredientSidebar } = useIngredientSidebar();
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [isMarkingRead, setIsMarkingRead] = useState(false);

  // An operator cannot open another account's pages, so in the admin an
  // activity never links into the account: the sidebar is its only detail.
  const isAdminScope = scope === PageScope.SUPERADMIN;

  // Helper to get preview URL from populated ingredient
  const getPreviewUrl = getActivityIngredientPreviewUrl;

  const handleViewIngredient = useCallback(
    (ingredient: unknown) => {
      if (ingredient) {
        openIngredientSidebar(ingredient as IIngredient);
      }
    },
    [openIngredientSidebar],
  );

  const getActivityHref = useCallback(
    (activity: IActivity): string | undefined => {
      if (isAdminScope) {
        return undefined;
      }
      const path = getActivityDestinationPath(activity);
      return path ? href(path) : undefined;
    },
    [href, isAdminScope],
  );

  const columns = useMemo(
    () => [
      {
        className: 'w-8 pr-0',
        header: '',
        key: 'unread',
        sortable: false,
        // Same unread dot as the notification inbox: it is the mark-as-read
        // button, and read rows show nothing.
        render: (a: IActivity) =>
          a.isRead ? null : (
            // ui-guard-allow:table-action -- unread dot is the row's mark-as-read control, matching the notification inbox
            <Button
              ariaLabel={translate('markRead')}
              onClick={() => toggleActivityRead(a.id)}
              size={ButtonSize.ICON}
              title={translate('markRead')}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              <span className="size-1.5 rounded-full bg-info">
                <span className="sr-only">{translate('unread')}</span>
              </span>
            </Button>
          ),
      },
      {
        header: translate('columnWhen'),
        key: 'when',
        sortable: false,
        className: 'w-44',
        render: (a: IActivity) => formatActivityClock(a.createdAt),
        subtext: (a: IActivity) => {
          const relative = a.createdAt ? getRelativeTime(a.createdAt) : '';
          const duration = getActivityRunDuration(a);
          return [duration ? `ran ${duration}` : null, relative]
            .filter(Boolean)
            .join(' · ');
        },
      },
      ...(isAdminScope
        ? [
            {
              header: translate('columnOrganization'),
              key: 'organization',
              sortable: false,
              render: (a: IActivity) => a.organizationLabel ?? '—',
            },
          ]
        : []),
      {
        header: translate('columnDescription'),
        key: 'label',
        sortable: false,
        render: (a: IActivity) => {
          const description = getActivityDescription(
            a,
            activityMessageFormatter,
          );
          const destination = getActivityHref(a);
          // The name opens the destination; a click anywhere else on the row
          // opens the sidebar.
          const title = destination ? (
            <Link
              aria-label={description}
              className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={destination}
            >
              {description}
            </Link>
          ) : (
            description
          );
          const parsed = parseActivityValue(a.value);
          const resultId = parsed?.resultId as string | undefined;
          return (
            <span className="flex items-center gap-3">
              <ActivityThumbnailCell
                activity={a}
                getPreviewUrl={getPreviewUrl}
                onViewIngredient={handleViewIngredient}
                parsedMediaUrl={
                  typeof parsed?.mediaUrl === 'string'
                    ? parsed.mediaUrl
                    : undefined
                }
                resultId={resultId}
                resultType={
                  (parsed?.resultType as IngredientCategory) ||
                  getResultTypeFromActivityKey(a.key)
                }
                status={getBackgroundTaskStatus(a.key)}
                isBackgroundTask={isBackgroundTask(a)}
              />
              <span>{title}</span>
            </span>
          );
        },
        subtext: (a: IActivity) =>
          [
            getActivityLifecycleText(a),
            getActivityDetailText(a, translateGenerationFailure),
          ]
            .filter(Boolean)
            .join(' · '),
      },
      {
        header: translate('columnStatus'),
        key: 'status',
        sortable: false,
        render: (a: IActivity) => {
          const status = getActivityStatus(a);
          return <ActivityStatusCell status={status} />;
        },
      },
      {
        className: 'w-24',
        header: translate('columnCredits'),
        key: 'cost',
        sortable: false,
        render: (a: IActivity) => (
          <span className="text-sm text-foreground/70">
            {getActivityCreditsDelta(a) ?? '—'}
          </span>
        ),
      },
    ],
    [
      activityMessageFormatter,
      getActivityHref,
      handleViewIngredient,
      isAdminScope,
      toggleActivityRead,
      translate,
      translateGenerationFailure,
    ],
  );

  const actions: TableAction<IActivity>[] = useMemo(
    () => [
      {
        // Published posts open on the network they went out to.
        href: (a: IActivity) => getPublishedPostLink(a)?.url,
        icon: (a: IActivity) => {
          const platform = getPublishedPostLink(a)?.platform;
          return (
            (platform ? getPlatformIcon(platform, 'size-4') : null) ?? (
              <ExternalLink className="size-4" />
            )
          );
        },
        isExternal: true,
        tooltip: (a: IActivity) => {
          const platform = getPublishedPostLink(a)?.platform;
          return platform
            ? `View on ${getPostsPlatformLabel(platform)}`
            : 'View post';
        },
      },
      ...(isAdminScope
        ? []
        : [
            {
              href: (a: IActivity) => {
                if (getPublishedPostLink(a)) {
                  return undefined;
                }
                const path = getActivityDestinationPath(a);
                return path ? href(path) : undefined;
              },
              icon: <ArrowUpRight className="size-4" />,
              tooltip: (a: IActivity) =>
                `Open ${getActivityDescription(a, activityMessageFormatter)}`,
            },
          ]),
    ],
    [activityMessageFormatter, href, isAdminScope],
  );

  const handleBulkMarkAsRead = useCallback(async () => {
    if (isMarkingRead) return;
    setIsMarkingRead(true);
    try {
      if (selectedActivityIds.length) {
        await markActivitiesAsRead(selectedActivityIds);
      } else {
        await markActivitiesAsRead();
      }
      setSelectedActivityIds([]);
    } finally {
      setIsMarkingRead(false);
    }
  }, [markActivitiesAsRead, selectedActivityIds, isMarkingRead]);

  const hasSelectedActivities = selectedActivityIds.length > 0;
  const hasUnreadActivities = useMemo(
    () => filteredActivities.some((activity) => !activity.isRead),
    [filteredActivities],
  );

  const bulkReadLabel = hasSelectedActivities
    ? `Mark ${selectedActivityIds.length} as Read`
    : 'Mark All Read';

  const rowSidebar = useMemo(
    () => ({
      getId: (activity: IActivity) => activity.id,
      getSubtitle: (activity: IActivity) =>
        getActivityLifecycleText(activity) ?? activity.key,
      getTitle: (activity: IActivity) =>
        getActivityDescription(activity, activityMessageFormatter),
      kind: 'activity' as const,
      render: (activity: IActivity) => (
        <ActivityDetailPanel
          activity={activity}
          onToggleRead={toggleActivityRead}
          openHref={getActivityHref(activity)}
        />
      ),
    }),
    [activityMessageFormatter, getActivityHref, toggleActivityRead],
  );

  const getRowKey = useCallback((a: IActivity) => a.id, []);
  const getGroupHeading = useCallback((a: IActivity) => {
    const dayKey = getActivityDayKey(a.createdAt);
    return {
      content: (
        <TableGroupHeading>
          {formatActivityDayHeading(dayKey)}
        </TableGroupHeading>
      ),
      key: dayKey,
    };
  }, []);
  const getItemId = useCallback((a: IActivity) => a.id, []);
  const getRowClassName = useCallback(
    (a: IActivity) => (a.isRead ? 'opacity-50' : ''),
    [],
  );

  // Selection state and its bulk action live in the subbar, not in a second
  // bar above the table.
  const headerActions = useMemo(
    () => (
      <div className="flex shrink-0 items-center gap-2">
        {hasSelectedActivities ? (
          <div
            role="status"
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            <span>
              {translate('selected', { count: selectedActivityIds.length })}
            </span>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              className="size-6"
              ariaLabel={translate('clearSelection')}
              onClick={() => setSelectedActivityIds([])}
            >
              <X aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        ) : null}
        <Button
          label={bulkReadLabel}
          onClick={handleBulkMarkAsRead}
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          isDisabled={
            isRefreshing ||
            isMarkingRead ||
            (!hasSelectedActivities && !hasUnreadActivities)
          }
        />
      </div>
    ),
    [
      bulkReadLabel,
      handleBulkMarkAsRead,
      hasSelectedActivities,
      hasUnreadActivities,
      isRefreshing,
      isMarkingRead,
      selectedActivityIds.length,
      translate,
    ],
  );

  const content = (
    <>
      <AppTable<IActivity>
        error={
          isError
            ? {
                title: translate('loadError'),
                onRetry: () => refresh(),
              }
            : undefined
        }
        items={filteredActivities}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getRowKey={getRowKey}
        getRowClassName={getRowClassName}
        getGroupHeading={getGroupHeading}
        emptyLabel={translate('empty')}
        selectable={true}
        selectedIds={selectedActivityIds}
        onSelectionChange={setSelectedActivityIds}
        getItemId={getItemId}
        rowSidebar={rowSidebar}
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="activities" totals={pageTotals} />
      </div>
    </>
  );

  const searchField = (
    <SearchField
      ariaLabel={translate('search')}
      onSearch={setSearch}
      placeholder={translate('search')}
      value={search}
    />
  );

  if (isAdminScope) {
    return (
      <AdminPageShell
        title={translate('title')}
        icon={ClipboardList}
        search={searchField}
        onRefresh={() => void refresh()}
        isRefreshing={isRefreshing}
        primaryAction={headerActions}
      >
        {content}
      </AdminPageShell>
    );
  }

  return (
    <Container
      label={translate('title')}
      icon={ClipboardList}
      titleVisibility="sr-only"
      leading={searchField}
      refresh={<ButtonRefresh onClick={refresh} isRefreshing={isRefreshing} />}
      right={headerActions}
    >
      {content}
    </Container>
  );
}
