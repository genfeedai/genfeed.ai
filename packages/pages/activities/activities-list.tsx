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
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useActivities } from '@hooks/data/activities/use-activities/use-activities';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ActivitiesListProps } from '@props/content/activities.props';
import type { TableAction, TableRowLink } from '@props/ui/display/table.props';
import { useIngredientOverlay } from '@providers/global-modals/global-modals.provider';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import {
  ArrowUpRight,
  ClipboardList,
  ExternalLink,
  Mail,
  MailOpen,
  X,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import {
  getActivityCreditsChange,
  getActivityDescription,
  getActivityDestinationPath,
  getActivityDetailText,
  getActivityIngredientPreviewUrl,
  getActivityLifecycleText,
  getActivityStatus,
  getBackgroundTaskStatus,
  getResultTypeFromActivityKey,
  isBackgroundTask,
  parseActivityValue,
  parsePostActivityValue,
} from './activities-list.utils';
import ActivityDetailSheet from './components/ActivityDetailSheet';
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
  const searchParams = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);

  const {
    isLoading,
    isError,
    isRefreshing,
    refresh,
    filteredActivities,
    markActivitiesAsRead,
    toggleActivityRead,
  } = useActivities({ limit: 20, page, scope });

  const { href } = useOrgUrl();
  const { openIngredientOverlay } = useIngredientOverlay();
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [detailActivityId, setDetailActivityId] = useState<string | null>(null);

  // An operator cannot open another account's pages, so in the admin an
  // activity opens its own detail view instead of linking into the account.
  const isAdminScope = scope === PageScope.SUPERADMIN;
  const detailActivity = useMemo(
    () =>
      filteredActivities.find((activity) => activity.id === detailActivityId) ??
      null,
    [detailActivityId, filteredActivities],
  );

  // Helper to get preview URL from populated ingredient
  const getPreviewUrl = getActivityIngredientPreviewUrl;

  const handleViewIngredient = useCallback(
    (ingredient: unknown) => {
      if (ingredient) {
        openIngredientOverlay(ingredient as IIngredient);
      }
    },
    [openIngredientOverlay],
  );

  const columns = useMemo(
    () => [
      {
        className: 'w-16',
        header: '',
        key: 'thumbnail',
        render: (a: IActivity) => {
          const parsed = parseActivityValue(a.value);
          const bgTask = isBackgroundTask(a);
          const status = getBackgroundTaskStatus(a.key);
          const resultType =
            (parsed?.resultType as IngredientCategory) ||
            getResultTypeFromActivityKey(a.key);
          const resultId = parsed?.resultId as string | undefined;
          const parsedMediaUrl =
            typeof parsed?.mediaUrl === 'string' ? parsed.mediaUrl : undefined;

          return (
            <ActivityThumbnailCell
              activity={a}
              isBackgroundTask={bgTask}
              status={status}
              resultType={resultType}
              parsedMediaUrl={parsedMediaUrl}
              resultId={resultId}
              getPreviewUrl={getPreviewUrl}
              onViewIngredient={handleViewIngredient}
            />
          );
        },
      },
      {
        header: 'Description',
        key: 'label',
        render: (a: IActivity) =>
          getActivityDescription(a, activityMessageFormatter),
        subtext: (a: IActivity) =>
          [getActivityLifecycleText(a), getActivityDetailText(a)]
            .filter(Boolean)
            .join(' · '),
      },
      {
        header: 'Status',
        key: 'status',
        render: (a: IActivity) => {
          const status = getActivityStatus(a);
          return <ActivityStatusCell status={status} />;
        },
      },
      {
        className: 'w-24',
        header: 'Credits',
        key: 'cost',
        render: (a: IActivity) => {
          const change = getActivityCreditsChange(a);
          return (
            <span className="text-sm text-foreground/70">
              {change ? activityMessageFormatter(change) : '—'}
            </span>
          );
        },
      },
    ],
    [activityMessageFormatter, handleViewIngredient],
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
      {
        getClassName: (a: IActivity) => (a.isRead ? 'opacity-50' : ''),
        icon: (a: IActivity) =>
          a.isRead ? (
            <MailOpen className="size-4 text-foreground/50" />
          ) : (
            <Mail className="size-4 text-info" />
          ),
        onClick: (a: IActivity) => toggleActivityRead(a.id),
        tooltip: (a: IActivity) =>
          a.isRead ? 'Mark as unread' : 'Mark as read',
      },
    ],
    [activityMessageFormatter, href, isAdminScope, toggleActivityRead],
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

  const getRowLink = useCallback(
    (activity: IActivity): TableRowLink | undefined => {
      if (isAdminScope) {
        return undefined;
      }
      const path = getActivityDestinationPath(activity);
      if (!path) {
        return undefined;
      }
      return {
        href: href(path),
        label: getActivityDescription(activity, activityMessageFormatter),
      };
    },
    [activityMessageFormatter, href, isAdminScope],
  );
  const handleRowClick = useCallback(
    (activity: IActivity) => setDetailActivityId(activity.id),
    [],
  );

  const getRowKey = useCallback((a: IActivity) => a.id, []);
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
                title: 'Failed to load activities',
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
        emptyLabel="No activity yet"
        selectable={true}
        selectedIds={selectedActivityIds}
        onSelectionChange={setSelectedActivityIds}
        getItemId={getItemId}
        getRowLink={getRowLink}
        onRowClick={isAdminScope ? handleRowClick : undefined}
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="activities" />
      </div>
    </>
  );

  if (isAdminScope) {
    return (
      <AdminPageShell
        title={translate('title')}
        icon={ClipboardList}
        onRefresh={() => void refresh()}
        isRefreshing={isRefreshing}
        primaryAction={headerActions}
      >
        {content}
        <ActivityDetailSheet
          activity={detailActivity}
          activityMessageFormatter={activityMessageFormatter}
          onClose={() => setDetailActivityId(null)}
          onToggleRead={toggleActivityRead}
        />
      </AdminPageShell>
    );
  }

  return (
    <Container
      label={translate('title')}
      description={translate('description')}
      icon={ClipboardList}
      titleVisibility="sr-only"
      refresh={<ButtonRefresh onClick={refresh} isRefreshing={isRefreshing} />}
      right={headerActions}
    >
      {content}
    </Container>
  );
}
