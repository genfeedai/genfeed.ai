'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IAnalytics } from '@genfeedai/contracts/interfaces';
import { useTrends } from '@hooks/data/trends/use-trends/use-trends';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import type { Task } from '@services/management/tasks.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import AppTable from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import Tabs from '@ui/navigation/tabs/Tabs';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Inbox, LayoutGrid } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Suspense, startTransition, useEffect, useMemo } from 'react';

import { useWorkspaceSurfaceSelection } from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';
import { getWorkspaceOverviewArtifactReferences } from '@/features/workspace-overview/workspace-overview-artifact-references';
import { useWorkspacePageContent } from './use-workspace-page-content';
import {
  hasWorkspaceOverviewSignal,
  WorkspaceDashboard,
} from './workspace-dashboard';
import { workspaceInboxTableColumns } from './workspace-inbox-columns';
import { WorkspaceOverviewSidebar } from './workspace-overview-sidebar';
import {
  DEFAULT_REVIEW_INBOX,
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
  initialAnalytics?: Partial<IAnalytics>;
  initialReviewInbox?: ReviewInboxSummary;
  initialTimeSeriesData?: PlatformTimeSeriesDataPoint[];
  section?: WorkspaceSection;
}

function WorkspacePageContentContent({
  defaultInboxView = 'unread',
  initialAnalytics,
  initialReviewInbox = DEFAULT_REVIEW_INBOX,
  initialTimeSeriesData,
  section = 'overview',
}: WorkspacePageContentProps) {
  const { brandId, organizationId } = useBrand();
  const { href } = useOrgUrl();
  const surfaceSelection = useWorkspaceSurfaceSelection();
  const { trends: trendItems, isLoading: isTrendsLoading } = useTrends();
  const {
    activeExecutions,
    activityItems,
    busyTaskId,
    historyPreviewItems,
    inProgressTasks,
    isInboxSection,
    isOverviewSection,
    isTaskComposerOpen,
    isWorkspaceRefreshing,
    isWorkspaceExecutionsLoading,
    isWorkspaceTasksLoading,
    mutateTask,
    openPlanningConversation,
    queueTasks,
    recentExecutions,
    recentInboxTasks,
    refreshWorkspaceTasks,
    replaceTaskSearchParam,
    reviewInboxTasks,
    executionStats,
    selectedTask,
    setSelectedTaskId,
    setTaskComposerOpen,
    setWorkspaceTasks,
    shouldShowComposer,
    shouldShowInbox,
    unreadInboxTasks,
    visibleInboxTasks,
    sectionCopy,
    workspaceActionError,
    workspaceLoadWarning,
    workspaceTasks,
  } = useWorkspacePageContent({
    defaultInboxView,
    initialAnalytics,
    initialReviewInbox,
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

  // Shares one predicate with the dashboard: when a brand has nothing in it the
  // dashboard collapses to a single guided first-run block, and the task queue
  // and sidebar have to disappear on exactly the same condition — otherwise the
  // guided block renders with the empty bands it exists to replace stacked
  // underneath it.
  const hasOverviewSignal = useMemo(
    () =>
      hasWorkspaceOverviewSignal({
        activeExecutions,
        isExecutionsLoading: isWorkspaceExecutionsLoading,
        isTasksLoading: isWorkspaceTasksLoading,
        isTrendsLoading,
        reviewInbox: initialReviewInbox,
        executions: recentExecutions,
        trendItems,
        workspaceTasks,
      }),
    [
      activeExecutions,
      initialReviewInbox,
      recentExecutions,
      isTrendsLoading,
      isWorkspaceExecutionsLoading,
      isWorkspaceTasksLoading,
      trendItems,
      workspaceTasks,
    ],
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

  const inboxViewTabs = useMemo(() => {
    if (!isInboxSection) {
      return null;
    }

    return (
      <Tabs
        activeTab={defaultInboxView}
        fullWidth={false}
        size="sm"
        variant="outline"
        items={INBOX_VIEW_OPTIONS.map((option) => {
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
              <Badge variant="outline">{count}</Badge>
            ),
            href: href(`/workspace/inbox/${option.id}`),
            id: option.id,
            label: option.label,
          };
        })}
      />
    );
  }, [
    defaultInboxView,
    href,
    isInboxSection,
    isWorkspaceTasksLoading,
    queueTasks.length,
    recentInboxTasks.length,
    unreadInboxTasks.length,
  ]);

  const activeInboxView = INBOX_VIEW_OPTIONS.find(
    (option) => option.id === defaultInboxView,
  );

  const workspaceHeaderActions = useMemo(() => {
    if (!inboxViewTabs && !shouldShowComposer && isOverviewSection) {
      return undefined;
    }

    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {inboxViewTabs}
        <ButtonRefresh
          onClick={() => void refreshWorkspaceTasks()}
          isRefreshing={isWorkspaceRefreshing}
        />
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
      </div>
    );
  }, [
    inboxViewTabs,
    isOverviewSection,
    isWorkspaceRefreshing,
    refreshWorkspaceTasks,
    setTaskComposerOpen,
    shouldShowComposer,
  ]);

  const inboxEmpty =
    section === 'inbox' && defaultInboxView === 'unread'
      ? {
          description: 'New work will land here when something needs you.',
          label: "You're caught up",
        }
      : section === 'inbox' && defaultInboxView === 'recent'
        ? {
            description:
              'Your five most recently updated inbox tasks will appear here as work moves through the queue.',
            label: 'No inbox activity yet',
          }
        : {
            description:
              'Tasks enter the inbox when they need review, a decision, or follow-up.',
            label: 'Inbox is empty',
          };

  const inboxTable = (
    <AppTable<Task>
      items={
        section === 'inbox' ? visibleInboxTasks : reviewInboxTasks.slice(0, 5)
      }
      isLoading={isWorkspaceTasksLoading}
      emptyLabel={inboxEmpty.label}
      emptyDescription={inboxEmpty.description}
      emptyState={
        <CardEmptyContent
          description={inboxEmpty.description}
          icon={Inbox}
          label={inboxEmpty.label}
        />
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
      icon={LayoutGrid}
      fullWidth
      titleVisibility="sr-only"
      right={isOverviewSection ? undefined : workspaceHeaderActions}
    >
      {workspaceActionError ? (
        <Alert type={AlertCategory.ERROR} className="mb-4">
          {workspaceActionError}
        </Alert>
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
          activeExecutions={activeExecutions}
          isExecutionsLoading={isWorkspaceExecutionsLoading}
          isTasksLoading={isWorkspaceTasksLoading}
          isTrendsLoading={isTrendsLoading}
          reviewInbox={initialReviewInbox}
          executions={recentExecutions}
          stats={executionStats}
          trendsHref={href('/discovery/overview')}
          trendItems={trendItems}
          workspaceTasks={workspaceTasks}
        />
      ) : null}

      <div className={WORKSPACE_SECTION_STACK_CLASS}>
        <div className={WORKSPACE_SECTION_STACK_CLASS}>
          {isOverviewSection && hasOverviewSignal ? (
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
              <WorkspaceSurface
                density="compact"
                description={
                  section === 'inbox'
                    ? (activeInboxView?.description ?? sectionCopy.description)
                    : 'Latest items waiting on your review.'
                }
                framed={false}
                title={section === 'inbox' ? sectionCopy.title : 'Inbox'}
              >
                {inboxTable}
              </WorkspaceSurface>
            </section>
          ) : null}
        </div>

        {isOverviewSection && hasOverviewSignal ? (
          <WorkspaceOverviewSidebar
            busyTaskId={busyTaskId}
            historyPreviewItems={historyPreviewItems}
            activeExecutions={activeExecutions}
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
    <Suspense fallback={null}>
      <WorkspacePageContentContent {...props} />
    </Suspense>
  );
}
