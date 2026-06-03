'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IActivity } from '@genfeedai/interfaces';
import type { IGenerationItem } from '@genfeedai/interfaces/components/generation.interface';
import type { UnifiedActivityItem } from '@genfeedai/interfaces/components/topbar-activities.interface';
import ClientDateTime from '@ui/components/time/ClientDateTime';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import Link from 'next/link';
import { HiArrowPath, HiCheck, HiXMark } from 'react-icons/hi2';
import ActivitiesTriggerButton from './ActivitiesTriggerButton';
import { getTaskElapsedLabel, getTaskEtaLabel } from './activities.utils';
import BackgroundTaskRow from './BackgroundTaskRow';
import RealtimeTaskRow from './RealtimeTaskRow';
import { useTopbarActivities } from './useTopbarActivities';

export default function TopbarActivities() {
  const {
    activeGenerations,
    activeRealtimeTasks,
    buildBackgroundTaskRowProps,
    completedBackgroundTaskIds,
    failedPreviews,
    hasActiveGenerations,
    hasAllRealtimeTasksDone,
    hasProcessingTasks,
    href,
    isHydrated,
    isOpen,
    loadingTaskId,
    navigateToStudio,
    processingBackgroundTasks,
    realtimeTasks,
    refresh,
    handleBackgroundTaskClick,
    handleClearCompleted,
    handleItemClick,
    handleMarkAllRead,
    handleRealtimeTaskClick,
    setFailedPreviews,
    setIsOpen,
    unifiedItems,
    unreadCount,
  } = useTopbarActivities();

  const renderItem = (item: UnifiedActivityItem) => {
    if (item.type === 'generation') {
      const generation = item.data as IGenerationItem;
      return (
        <div key={item.id} className="w-full">
          <Button
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={() => handleItemClick(item)}
            className={cn(
              'flex w-full flex-col items-start gap-1.5 px-3 py-2 text-left text-sm',
              'font-medium transition-colors duration-150 text-foreground/70 hover:text-foreground/90',
              'hover:bg-background/60 focus:bg-background/60 focus:outline-none',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span className="capitalize">{generation.type} generation</span>
              <Badge variant="primary" size={ComponentSize.SM}>
                Active
              </Badge>
            </div>
            {generation.prompt && (
              <span className="w-full truncate text-xs text-foreground/60">
                {generation.prompt}
              </span>
            )}
          </Button>
        </div>
      );
    }

    if (item.type === 'background-task') {
      const activity = item.data as IActivity;
      const { label, preview, progress, status } =
        buildBackgroundTaskRowProps(activity);
      return (
        <BackgroundTaskRow
          key={item.id}
          activity={activity}
          loadingTaskId={loadingTaskId}
          failedPreviews={failedPreviews}
          status={status}
          label={label}
          progress={progress}
          preview={preview}
          onFailedPreview={(id) =>
            setFailedPreviews((prev) => new Set(prev).add(id))
          }
          onClick={handleBackgroundTaskClick}
        />
      );
    }

    const activity = item.data as IActivity;
    return (
      <div key={item.id} className="w-full">
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          onClick={() => handleItemClick(item)}
          className={cn(
            'flex w-full items-center justify-between gap-2',
            'px-3 py-2 text-left text-sm font-medium transition-colors duration-150',
            'text-foreground/70 hover:text-foreground/90 hover:bg-background/60 focus:bg-background/60 focus:outline-none min-h-[2.5rem]',
          )}
        >
          <span className="flex-1">
            {activity.label || `${activity.key}: ${activity.value}`}
          </span>
          <span className="text-xs text-foreground/60">
            <ClientDateTime
              value={activity.createdAt}
              format={(date) => date.toLocaleDateString()}
            />
          </span>
        </Button>
      </div>
    );
  };

  const triggerButton = (
    <ActivitiesTriggerButton
      hasActiveGenerations={hasActiveGenerations}
      hasProcessingTasks={hasProcessingTasks}
      activeRealtimeTaskCount={activeRealtimeTasks.length}
      hasAllRealtimeTasksDone={hasAllRealtimeTasksDone}
      totalLegacyCount={
        activeGenerations.length + processingBackgroundTasks.length
      }
    />
  );

  if (!isHydrated) {
    return triggerButton;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>

      <PopoverPanelContent align="end" className="w-80 p-0">
        <div className="border-b border-foreground/[0.08] px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold">Activities</span>
          <div className="flex items-center gap-2">
            {completedBackgroundTaskIds.length > 0 && (
              <Button
                withWrapper={false}
                variant={ButtonVariant.GHOST}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearCompleted();
                }}
                className="flex size-7 items-center justify-center text-foreground/60 hover:text-foreground/90 hover:bg-background/60 transition-colors duration-150 p-0 min-h-0"
                ariaLabel="Clear completed tasks"
              >
                <HiXMark className="size-4" />
              </Button>
            )}
            {unreadCount > 0 && (
              <Button
                withWrapper={false}
                variant={ButtonVariant.GHOST}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkAllRead();
                }}
                className="flex size-7 items-center justify-center text-foreground/60 hover:text-foreground/90 hover:bg-background/60 transition-colors duration-150 p-0 min-h-0"
                ariaLabel="Mark all as read"
              >
                <HiCheck className="size-4" />
              </Button>
            )}
            <Button
              withWrapper={false}
              variant={ButtonVariant.GHOST}
              onClick={(e) => {
                e.stopPropagation();
                refresh();
              }}
              className="flex size-7 items-center justify-center text-foreground/60 hover:text-foreground/90 hover:bg-background/60 transition-colors duration-150 p-0 min-h-0"
              ariaLabel="Refresh activities"
            >
              <HiArrowPath className="size-4" />
            </Button>
          </div>
        </div>

        <div className="max-h-60 w-full overflow-y-auto overflow-x-hidden">
          <div className="w-full space-y-1 p-2">
            {realtimeTasks.length > 0 && (
              <>
                {realtimeTasks
                  .slice()
                  .sort(
                    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
                  )
                  .map((task) => (
                    <RealtimeTaskRow
                      key={task.id}
                      task={task}
                      etaLabel={getTaskEtaLabel(task)}
                      elapsedLabel={getTaskElapsedLabel(task)}
                      onClick={handleRealtimeTaskClick}
                    />
                  ))}
                <div className="border-t border-foreground/[0.08] my-1" />
              </>
            )}

            {unifiedItems.length === 0 ? (
              <div className="w-full p-3 text-sm text-foreground/70">
                No activities yet
              </div>
            ) : (
              unifiedItems.map((item) => renderItem(item))
            )}
          </div>
        </div>

        <div className="border-t border-foreground/[0.08] p-2 space-y-2">
          {hasActiveGenerations && (
            <Button
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              className="w-full px-3 py-2 text-sm font-medium transition-colors duration-150 text-foreground/70 hover:text-foreground/90 hover:bg-background/60"
              onClick={navigateToStudio}
            >
              Go to Studio
            </Button>
          )}

          <Link
            href={href('/overview/activities')}
            className="inline-flex items-center justify-center border border-foreground/[0.08] bg-foreground/[0.05] text-foreground/70 hover:text-foreground/90 hover:bg-foreground/[0.08] h-9 px-4 py-2 text-sm font-medium w-full no-underline transition-colors duration-150"
            onClick={() => setIsOpen(false)}
          >
            View all activities
          </Link>
        </div>
      </PopoverPanelContent>
    </Popover>
  );
}
