'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IAgentRun, IAnalytics } from '@genfeedai/interfaces';
import type { AgentRunStats } from '@genfeedai/types';
import { useTrends } from '@hooks/data/trends/use-trends/use-trends';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import type { Task } from '@services/management/tasks.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import AppTable from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import dynamic from 'next/dynamic';
import { Suspense, startTransition, useEffect, useMemo } from 'react';
import { HiOutlineSquares2X2 } from 'react-icons/hi2';
import { useWorkspaceSurfaceSelection } from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';
import { getWorkspaceOverviewArtifactReferences } from '@/features/workspace-overview/workspace-overview-artifact-references';
import { useWorkspacePageContent } from './use-workspace-page-content';
import { WorkspaceDashboard } from './workspace-dashboard';
import { workspaceInboxTableColumns } from './workspace-inbox-columns';
import { WorkspaceOverviewSidebar } from './workspace-overview-sidebar';
import { WorkspaceSnapshotSection } from './workspace-snapshot-section';
import {
  DEFAULT_REVIEW_INBOX,
  EMPTY_AGENT_RUNS,
  INBOX_VIEW_OPTIONS,
  type InboxView,
  type ReviewInboxSummary,
  WORKSPACE_SECTION_STACK_CLASS,
  type WorkspaceSection,
} from './workspace-task.helpers';
import { WorkspaceTaskInspector } from './workspace-task-inspector';
import { WorkspaceTaskQueueCard } from './workspace-task-queue-card';

const WorkspaceTaskComposer = dynamic(
  () =>
    import('./workspace-task-composer').then(
      (module) => module.WorkspaceTaskComposer,
    ),
  { ssr: false },
);

interface WorkspacePageContentProps {
  defaultInboxView?: InboxView;
  initialActiveRuns?: IAgentRun[];
  initialAnalytics?: Partial<IAnalytics>;
  initialReviewInbox?: ReviewInboxSummary;
  initialRuns?: IAgentRun[];
  initialStats?: AgentRunStats | null;
  initialTimeSeriesData?: PlatformTimeSeriesDataPoint[];
  section?: WorkspaceSection;
}

function WorkspacePageContentContent({
  defaultInboxView = 'unread',
  initialActiveRuns = EMPTY_AGENT_RUNS,
  initialAnalytics,
  initialReviewInbox = DEFAULT_REVIEW_INBOX,
  initialRuns = EMPTY_AGENT_RUNS,
  initialStats = null,
  initialTimeSeriesData,
  section = 'overview',
}: WorkspacePageContentProps) {
  const { brandId, organizationId } = useBrand();
  const { href } = useOrgUrl();
  const surfaceSelection = useWorkspaceSurfaceSelection();
  const { trends: trendItems, isLoading: isTrendsLoading } = useTrends();
  const {
    activityItems,
    busyTaskId,
    historyPreviewItems,
    inProgressTasks,
    isInboxSection,
    isOverviewSection,
    isTaskComposerOpen,
    isWorkspaceRefreshing,
    isWorkspaceRunsLoading,
    isWorkspaceTasksLoading,
    mutateTask,
    openPlanningConversation,
    queueTasks,
    recentInboxTasks,
    refreshWorkspaceTasks,
    replaceTaskSearchParam,
    reviewInboxTasks,
    selectedTask,
    setSelectedTaskId,
    setTaskComposerOpen,
    setWorkspaceTasks,
    shouldShowComposer,
    shouldShowHistory,
    shouldShowInbox,
    shouldShowSectionSnapshot,
    summaryItems,
    unreadInboxTasks,
    visibleInboxTasks,
    sectionCopy,
    workspaceActionError,
    workspaceLoadWarning,
    workspaceTasks,
  } = useWorkspacePageContent({
    defaultInboxView,
    initialActiveRuns,
    initialAnalytics,
    initialReviewInbox,
    initialRuns,
    initialStats,
    initialTimeSeriesData,
    section,
  });
  const selectedArtifactReferences = useMemo(
    () =>
      getWorkspaceOverviewArtifactReferences(selectedTask, {
        brandId,
        organizationId,
      }),
    [brandId, organizationId, selectedTask],
  );

  useEffect(() => {
    if (!surfaceSelection || !isOverviewSection) {
      return;
    }

    surfaceSelection.setArtifactReferences(selectedArtifactReferences);
    return () => {
      surfaceSelection.setArtifactReferences([]);
    };
  }, [isOverviewSection, selectedArtifactReferences, surfaceSelection]);

  const workspaceHeaderActions = useMemo(
    () => (
      <div className="flex flex-wrap gap-2">
        {shouldShowComposer ? (
          <Button
            data-testid="workspace-new-task"
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            onClick={() => setTaskComposerOpen(true)}
          >
            New Task
          </Button>
        ) : null}
        <ButtonRefresh
          onClick={() => void refreshWorkspaceTasks()}
          isRefreshing={isWorkspaceRefreshing}
        />
      </div>
    ),
    [
      shouldShowComposer,
      setTaskComposerOpen,
      refreshWorkspaceTasks,
      isWorkspaceRefreshing,
    ],
  );

  const inboxTable = (
    <AppTable<Task>
      items={
        section === 'inbox' ? visibleInboxTasks : reviewInboxTasks.slice(0, 5)
      }
      isLoading={isWorkspaceTasksLoading}
      emptyLabel={
        section === 'inbox' && defaultInboxView === 'unread'
          ? 'No unread inbox items right now.'
          : 'No inbox items yet.'
      }
      getRowKey={(task) => task.id}
      getItemId={(task) => task.id}
      onRowClick={(task) => {
        setSelectedTaskId(task.id);
        replaceTaskSearchParam(task.id);
      }}
      columns={workspaceInboxTableColumns}
    />
  );

  return (
    <Container
      label={sectionCopy.title}
      description={sectionCopy.description}
      icon={HiOutlineSquares2X2}
      fullWidth
      titleVisibility="sr-only"
      {...(isInboxSection
        ? {
            activeTab: defaultInboxView,
            headerTabs: {
              activeTab: defaultInboxView,
              fullWidth: false,
              items: INBOX_VIEW_OPTIONS.map((option) => {
                const count =
                  option.id === 'unread'
                    ? unreadInboxTasks.length
                    : option.id === 'recent'
                      ? recentInboxTasks.length
                      : queueTasks.length;
                return {
                  badge: isWorkspaceTasksLoading ? (
                    <Skeleton
                      variant="text"
                      width={14}
                      height={12}
                      className="opacity-70"
                    />
                  ) : (
                    <span className="text-[11px] opacity-70">{count}</span>
                  ),
                  href: `/workspace/inbox/${option.id}`,
                  id: option.id,
                  label: option.label,
                };
              }),
              size: 'sm' as const,
              variant: 'underline' as const,
            },
          }
        : {})}
      right={isOverviewSection ? undefined : workspaceHeaderActions}
    >
      {workspaceActionError ? (
        <p className="mb-4 rounded-md border border-rose-400/30 bg-rose-400/8 px-3 py-2 text-xs text-rose-200">
          {workspaceActionError}
        </p>
      ) : null}

      {workspaceLoadWarning ? (
        <Alert type={AlertCategory.WARNING} className="mb-4">
          {workspaceLoadWarning}
        </Alert>
      ) : null}

      {isTaskComposerOpen ? (
        <WorkspaceTaskComposer
          open={isTaskComposerOpen}
          onOpenChange={setTaskComposerOpen}
          onTaskCreated={(createdTask) => {
            startTransition(() => {
              setWorkspaceTasks((current) => [createdTask, ...current]);
            });
          }}
        />
      ) : null}

      {isOverviewSection ? (
        <WorkspaceDashboard
          activeRuns={initialActiveRuns}
          isRunsLoading={isWorkspaceRunsLoading}
          isTasksLoading={isWorkspaceTasksLoading}
          isTrendsLoading={isTrendsLoading}
          reviewInbox={initialReviewInbox}
          runs={initialRuns}
          stats={initialStats}
          trendsHref={href('/research/discovery')}
          trendItems={trendItems}
          workspaceTasks={workspaceTasks}
        />
      ) : null}

      {shouldShowSectionSnapshot ? (
        <WorkspaceSnapshotSection
          isLoading={isWorkspaceTasksLoading}
          summaryItems={summaryItems}
        />
      ) : null}

      <div className={WORKSPACE_SECTION_STACK_CLASS}>
        <div className={WORKSPACE_SECTION_STACK_CLASS}>
          {isOverviewSection ? (
            <WorkspaceTaskQueueCard
              busyTaskId={busyTaskId}
              isLoading={isWorkspaceTasksLoading}
              items={activityItems}
              mutateTask={mutateTask}
              openPlanningConversation={openPlanningConversation}
            />
          ) : null}

          {shouldShowInbox ? (
            <section
              aria-busy={isWorkspaceTasksLoading}
              data-testid="workspace-inbox"
              className="space-y-3"
            >
              {section === 'inbox' ? (
                <>
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/35">
                    {defaultInboxView}
                  </h2>
                  {inboxTable}
                </>
              ) : (
                <WorkspaceSurface
                  title="Inbox"
                  description="Latest items waiting on your review."
                  density="compact"
                >
                  {inboxTable}
                </WorkspaceSurface>
              )}
            </section>
          ) : null}

          {shouldShowHistory ? (
            <section
              aria-busy={isWorkspaceTasksLoading}
              data-testid="workspace-activity"
              className="space-y-3"
            >
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/35">
                Activity
              </h2>
              <AppTable<Task>
                items={activityItems}
                isLoading={isWorkspaceTasksLoading}
                emptyLabel="Activity will appear here once tasks start running."
                getRowKey={(task) => task.id}
                getItemId={(task) => task.id}
                onRowClick={(task) => {
                  setSelectedTaskId(task.id);
                  replaceTaskSearchParam(task.id);
                }}
                columns={workspaceInboxTableColumns}
              />
            </section>
          ) : null}
        </div>

        {isOverviewSection ? (
          <WorkspaceOverviewSidebar
            busyTaskId={busyTaskId}
            historyPreviewItems={historyPreviewItems}
            initialActiveRuns={initialActiveRuns}
            initialReviewInbox={initialReviewInbox}
            inProgressTasks={inProgressTasks}
            isTasksLoading={isWorkspaceTasksLoading}
            mutateTask={mutateTask}
            openPlanningConversation={openPlanningConversation}
            replaceTaskSearchParam={replaceTaskSearchParam}
            setSelectedTaskId={setSelectedTaskId}
          />
        ) : null}
      </div>

      <WorkspaceTaskInspector
        task={selectedTask}
        busyTaskId={busyTaskId}
        onKeepOutput={(taskId, outputId) =>
          mutateTask(taskId, (service) => service.keepOutput(taskId, outputId))
        }
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTaskId(null);
            replaceTaskSearchParam(null);
          }
        }}
        onApprove={(taskId) =>
          mutateTask(taskId, (service) => service.approve(taskId))
        }
        onDismiss={(taskId) =>
          mutateTask(taskId, (service) => service.dismiss(taskId))
        }
        onPlanNextSteps={(task) => openPlanningConversation(task)}
        onRequestChanges={(taskId) =>
          mutateTask(taskId, (service) =>
            service.requestChanges(
              taskId,
              'Please revise this task from the workspace inbox.',
            ),
          )
        }
        onTrashOutput={(taskId, outputId) =>
          mutateTask(taskId, (service) => service.trashOutput(taskId, outputId))
        }
        onUnkeepOutput={(taskId, outputId) =>
          mutateTask(taskId, (service) =>
            service.unkeepOutput(taskId, outputId),
          )
        }
      />
    </Container>
  );
}

export default function WorkspacePageContent(
  props: Parameters<typeof WorkspacePageContentContent>[0],
) {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <WorkspacePageContentContent {...props} />
    </Suspense>
  );
}
