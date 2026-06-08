'use client';

import {
  ActivityKey,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/enums';
import type { IActivity, IIngredient } from '@genfeedai/interfaces';
import { useActivities } from '@hooks/data/activities/use-activities/use-activities';
import type { ActivitiesListProps } from '@props/content/activities.props';
import type { TableAction } from '@props/ui/display/table.props';
import { useIngredientOverlay } from '@providers/global-modals/global-modals.provider';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  HiEnvelope,
  HiEnvelopeOpen,
  HiOutlineClipboardDocumentList,
} from 'react-icons/hi2';
import {
  getActivityDescription,
  getBackgroundTaskStatus,
  getResultTypeFromActivityKey,
  isBackgroundTask,
  isCreditActivity,
  parseActivityValue,
  parsePostActivityValue,
} from './activities-list.utils';
import ActivityLinkCell from './components/ActivityLinkCell';
import ActivityStatusCell from './components/ActivityStatusCell';
import ActivityThumbnailCell from './components/ActivityThumbnailCell';

export default function ActivitiesList({ scope }: ActivitiesListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);

  const {
    isLoading,
    isRefreshing,
    refresh,
    filteredActivities,
    markActivitiesAsRead,
    toggleActivityRead,
  } = useActivities({ limit: 20, page, scope });

  const { openIngredientOverlay } = useIngredientOverlay();
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);

  // Helper to get preview URL from populated ingredient
  const getPreviewUrl = useCallback(
    (
      ingredient: Record<string, unknown>,
      category: IngredientCategory,
    ): string | undefined => {
      if (!ingredient) {
        return undefined;
      }

      if (category === IngredientCategory.VIDEO) {
        if (ingredient.thumbnailUrl) {
          return ingredient.thumbnailUrl as string;
        }
        if (ingredient.id) {
          return `${EnvironmentService.cdnUrl}/ingredients/thumbnails/${ingredient.id}`;
        }
      } else if (category === IngredientCategory.IMAGE) {
        if (ingredient.ingredientUrl) {
          return ingredient.ingredientUrl as string;
        } else if (ingredient.thumbnailUrl) {
          return ingredient.thumbnailUrl as string;
        }
      }

      return undefined;
    },
    [],
  );

  const handleViewIngredient = useCallback(
    (ingredient: unknown) => {
      if (ingredient) {
        openIngredientOverlay(ingredient as IIngredient);
      }
    },
    [openIngredientOverlay],
  );

  // Status variant mapping
  const statusVariants: Record<
    string,
    'success' | 'error' | 'warning' | 'info'
  > = useMemo(
    () => ({
      completed: 'success',
      failed: 'error',
      pending: 'warning',
      processing: 'info',
    }),
    [],
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
        render: (a: IActivity) => getActivityDescription(a),
      },
      {
        header: 'Status',
        key: 'status',
        render: (a: IActivity) => {
          let status: string;
          if (isBackgroundTask(a)) {
            status = getBackgroundTaskStatus(a.key);
          } else if (isCreditActivity(a.key)) {
            status = 'completed';
          } else {
            status = a.status || 'pending';
          }
          return (
            <ActivityStatusCell
              status={status}
              statusVariants={statusVariants}
            />
          );
        },
      },
      {
        className: 'w-24',
        header: 'Cost',
        key: 'cost',
        render: (a: IActivity) => {
          if (!isCreditActivity(a.key)) return null;
          const parsed = parseActivityValue(a.value);
          const amount = (parsed?.value as string) || a.value;
          if (!amount) return null;
          return (
            <span className="text-sm text-foreground/70">{amount} credits</span>
          );
        },
      },
      {
        className: 'w-20',
        header: '',
        key: 'link',
        render: (a: IActivity) => {
          // Show external link for published posts
          if (a.key === ActivityKey.POST_PUBLISHED && a.value) {
            const postInfo = parsePostActivityValue(a.value);

            if (postInfo?.url && postInfo?.platform) {
              return (
                <ActivityLinkCell
                  url={postInfo.url}
                  platform={postInfo.platform}
                />
              );
            }
          }
          return null;
        },
      },
      {
        header: 'Details',
        key: 'value',
        render: (a: IActivity) => {
          // Only show value if it's not asset information and not a post link
          if (
            a.value &&
            !isCreditActivity(a.key) &&
            !a.value.startsWith('{') &&
            !a.value.includes('/images/') &&
            !a.value.includes('/videos/') &&
            !a.value.startsWith('Published to')
          ) {
            return (
              <span className="text-sm text-foreground/70">{a.value}</span>
            );
          }
          return null;
        },
      },
    ],
    [getPreviewUrl, handleViewIngredient, statusVariants],
  );

  const actions: TableAction<IActivity>[] = useMemo(
    () => [
      {
        getClassName: (a: IActivity) => (a.isRead ? 'opacity-50' : ''),
        icon: (a: IActivity) =>
          a.isRead ? (
            <HiEnvelopeOpen className="size-4 text-foreground/50" />
          ) : (
            <HiEnvelope className="size-4 text-info" />
          ),
        onClick: (a: IActivity) => toggleActivityRead(a.id),
        tooltip: (a: IActivity) =>
          a.isRead ? 'Mark as unread' : 'Mark as read',
      },
    ],
    [toggleActivityRead],
  );

  const handleBulkMarkAsRead = async () => {
    if (selectedActivityIds.length > 0) {
      // Mark selected activities as read
      await markActivitiesAsRead(selectedActivityIds);
      setSelectedActivityIds([]);
    } else {
      // Mark all unread activities as read
      await markActivitiesAsRead();
    }
  };

  // Determine button state and copy
  const hasSelectedActivities = selectedActivityIds.length > 0;
  const hasUnreadActivities = filteredActivities.some(
    (activity) => !activity.isRead,
  );

  const getButtonLabel = () => {
    if (hasSelectedActivities) {
      return `Mark ${selectedActivityIds.length} as Read`;
    }

    return 'Mark All Read';
  };

  const handleRowClick = useCallback(
    (activity: IActivity) => {
      const parsed = parseActivityValue(activity.value);
      const href = typeof parsed?.href === 'string' ? parsed.href : undefined;

      if (href) {
        router.push(href);
      }
    },
    [router],
  );

  return (
    <Container
      label="Activities"
      description="Recent actions and system events."
      icon={HiOutlineClipboardDocumentList}
      right={
        <>
          <ButtonRefresh
            onClick={() => refresh()}
            isRefreshing={isRefreshing}
          />

          <Button
            label={getButtonLabel()}
            onClick={handleBulkMarkAsRead}
            variant={ButtonVariant.DEFAULT}
            isDisabled={
              isRefreshing || (!hasSelectedActivities && !hasUnreadActivities)
            }
          />
        </>
      }
    >
      <AppTable<IActivity>
        items={filteredActivities}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getRowKey={(a: IActivity) => a.id}
        getRowClassName={(a: IActivity) => (a.isRead ? 'opacity-50' : '')}
        emptyLabel="No activity yet"
        selectable={true}
        selectedIds={selectedActivityIds}
        onSelectionChange={setSelectedActivityIds}
        getItemId={(a: IActivity) => a.id}
        onRowClick={handleRowClick}
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="activities" />
      </div>
    </Container>
  );
}
