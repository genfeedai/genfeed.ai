'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IAgentRun, IAnalytics } from '@genfeedai/interfaces';
import type { AgentRunStats } from '@genfeedai/types';
import { useTrends } from '@hooks/data/trends/use-trends/use-trends';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import type { Task } from '@services/management/tasks.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import dynamic from 'next/dynamic';
import { Suspense, startTransition, useMemo } from 'react';
import { HiOutlineSquares2X2 } from 'react-icons/hi2';
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
  const { href } = useOrgUrl();
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
                  badge: (
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
        <WorkspaceSnapshotSection summaryItems={summaryItems} />
      ) : null}

      <div className={WORKSPACE_SECTION_STACK_CLASS}>
        <div className={WORKSPACE_SECTION_STACK_CLASS}>
          {isOverviewSection ? (
            <WorkspaceTaskQueueCard
              busyTaskId={busyTaskId}
              items={activityItems}
              mutateTask={mutateTask}
              openPlanningConversation={openPlanningConversation}
            />
          ) : null}

          {shouldShowInbox ? (
            <section data-testid="workspace-inbox" className="space-y-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/35">
                {section === 'inbox' ? defaultInboxView : 'Inbox'}
              </h2>
              <AppTable<Task>
                items={
                  section === 'inbox'
                    ? visibleInboxTasks
                    : reviewInboxTasks.slice(0, 5)
                }
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
            </section>
          ) : null}

          {shouldShowHistory ? (
            <section data-testid="workspace-activity" className="space-y-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/35">
                Activity
              </h2>
              <AppTable<Task>
                items={activityItems}
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
    <Suspense fallback={null}>
      <WorkspacePageContentContent {...props} />
    </Suspense>
  );
}
