'use client';

import { useTaskStatusLabels } from '@app/(protected)/[orgSlug]/[brandSlug]/tasks/task-status.constants';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { createFilterHref } from '@helpers/navigation/filter-href.helper';
import { useTrends } from '@hooks/data/trends/use-trends/use-trends';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TabsProps } from '@props/ui/navigation/tabs.props';
import type { WorkspacePageContentProps } from '@props/workspace/workspace-page.props';
import type { Task } from '@services/management/tasks.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import AppTable from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Inbox, LayoutGrid } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useWorkspaceSurfaceSelection } from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';
import { getWorkspaceOverviewArtifactReferences } from '@/features/workspace-overview/workspace-overview-artifact-references';
import { useWorkspacePageContent } from './use-workspace-page-content';
import {
  hasWorkspaceOverviewSignal,
  WorkspaceDashboard,
} from './workspace-dashboard';
import { getWorkspaceInboxTableColumns } from './workspace-inbox-columns';
import { WorkspaceOverviewSidebar } from './workspace-overview-sidebar';
import {
  DEFAULT_REVIEW_INBOX,
  useInboxViewOptions,
  WORKSPACE_SECTION_STACK_CLASS,
} from './workspace-task.helpers';
import { WorkspaceTaskQueueCard } from './workspace-task-queue-card';
import { WorkspaceTaskRailAdapter } from './workspace-task-rail-adapter';

const WorkspaceTaskComposer = dynamic(
  () =>
    import('./workspace-task-composer').then(
      (module) => module.WorkspaceTaskComposer,
    ),
  { ssr: false },
);

function WorkspacePageContentContent({
  defaultInboxView = 'unread',
  initialAnalytics,
  initialReviewInbox = DEFAULT_REVIEW_INBOX,
  initialTimeSeriesData,
  section = 'overview',
}: WorkspacePageContentProps) {
  const translate = useTranslations('pages.workspaceOverview');
  const statusTranslate = useTranslations('pages.tasks.status');
  const statusLabels = useTaskStatusLabels();
  const inboxViewOptions = useInboxViewOptions();
  const { brandId, organizationId } = useBrand();
  const { href } = useOrgUrl();
  const inboxSearch = useSearchParams()?.toString() ?? '';
  const surfaceSelection = useWorkspaceSurfaceSelection();
  const { trends: trendItems, isLoading: isTrendsLoading } = useTrends();
  const {
    activeExecutions,
    activityItems,
    inboxRead,
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

  // A row tap opens the mobile drawer; a `?taskId=` restored on load does not.
  const [tappedTaskId, setTappedTaskId] = useState<string | null>(null);
  const selectTaskFromTap = useCallback(
    (taskId: string | null) => {
      setTappedTaskId(taskId);
      setSelectedTaskId(taskId);
    },
    [setSelectedTaskId],
  );
  // A tap only vouches for the selection it made: once that task is closed, a
  // later `?taskId=` restore of the same task is automatic again.
  const selectedTaskKey = selectedTask?.id ?? null;
  useEffect(() => {
    if (!selectedTaskKey) {
      setTappedTaskId(null);
    }
  }, [selectedTaskKey]);
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

  const inboxHeaderTabs = useMemo<TabsProps | undefined>(() => {
    if (!isInboxSection) {
      return undefined;
    }

    return {
      activeTab: defaultInboxView,
      ariaLabel: translate('inbox.viewsAriaLabel'),
      fullWidth: false,
      items: inboxViewOptions.map((option) => {
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
          href: createFilterHref(
            href('/workspace/inbox'),
            inboxSearch,
            'view',
            option.id,
          ),
          id: option.id,
          label: option.label,
        };
      }),
    };
  }, [
    defaultInboxView,
    href,
    inboxViewOptions,
    inboxSearch,
    isInboxSection,
    isWorkspaceTasksLoading,
    queueTasks.length,
    recentInboxTasks.length,
    translate,
    unreadInboxTasks.length,
  ]);

  const workspaceHeaderActions = useMemo(() => {
    if (!shouldShowComposer && isOverviewSection) {
      return undefined;
    }

    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {isInboxSection ? (
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            disabled={
              inboxRead.read.isPending ||
              !inboxRead.state.data ||
              !inboxRead.state.data?.unreadCount
            }
            onClick={() => inboxRead.read.mutate(null)}
          >
            {translate('inbox.markAllRead')}
          </Button>
        ) : null}
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
    isOverviewSection,
    isInboxSection,
    inboxRead,
    translate,
    isWorkspaceRefreshing,
    refreshWorkspaceTasks,
    setTaskComposerOpen,
    shouldShowComposer,
  ]);

  const inboxEmptyKey =
    section === 'inbox' && defaultInboxView === 'unread'
      ? 'unread'
      : section === 'inbox' && defaultInboxView === 'recent'
        ? 'recent'
        : 'all';
  const inboxReadFailed =
    section === 'inbox' &&
    defaultInboxView === 'unread' &&
    inboxRead.state.isError;
  const inboxEmpty = inboxReadFailed
    ? {
        description: translate('inbox.readError'),
        label: translate('inbox.readError'),
      }
    : {
        description: translate(`inboxEmpty.${inboxEmptyKey}.description`),
        label: translate(`inboxEmpty.${inboxEmptyKey}.label`),
      };

  const inboxTableItems =
    section === 'inbox' ? visibleInboxTasks : reviewInboxTasks.slice(0, 5);
  // Only agent-run tasks carry an execution path; hide the column when none do
  // so seeded or manual queues never show an empty column.
  const hasInboxPaths = inboxTableItems.some((task) =>
    Boolean(task.executionPathUsed),
  );
  const workspaceInboxTableColumns = useMemo(
    () =>
      getWorkspaceInboxTableColumns(
        translate,
        statusTranslate,
        statusLabels,
        inboxRead.isUnread,
        (task) => inboxRead.read.mutate([task]),
        inboxRead.read.isPending || !inboxRead.state.data,
      ),
    [translate, statusTranslate, statusLabels, inboxRead],
  );
  const inboxTableColumns = hasInboxPaths
    ? workspaceInboxTableColumns
    : workspaceInboxTableColumns.filter(
        (column) => column.key !== 'executionPathUsed',
      );

  const inboxTable = (
    <AppTable<Task>
      items={inboxTableItems}
      isLoading={isWorkspaceTasksLoading || inboxRead.state.isLoading}
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
        if (inboxRead.state.data && inboxRead.isUnread(task))
          inboxRead.read.mutate([task]);
        selectTaskFromTap(task.id);
        replaceTaskSearchParam(task.id);
      }}
      columns={inboxTableColumns}
    />
  );

  return (
    <Container
      label={sectionCopy.title}
      description={sectionCopy.description}
      icon={LayoutGrid}
      fullWidth
      titleVisibility="sr-only"
      headerTabs={inboxHeaderTabs}
      right={isOverviewSection ? undefined : workspaceHeaderActions}
    >
      {inboxRead.state.isError || inboxRead.read.isError ? (
        <Alert type={AlertCategory.ERROR} className="mb-4">
          {translate('inbox.readError')}
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            disabled={inboxRead.read.isPending}
            onClick={() => {
              if (
                inboxRead.read.isError &&
                inboxRead.read.variables !== undefined
              )
                inboxRead.read.mutate(inboxRead.read.variables);
              else void inboxRead.state.refetch();
            }}
          >
            {translate('inbox.retry')}
          </Button>
        </Alert>
      ) : null}
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
              isLoading={isWorkspaceTasksLoading || inboxRead.state.isLoading}
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
                inboxTable
              ) : (
                <WorkspaceSurface
                  density="compact"
                  description="Latest items waiting on your review."
                  framed={false}
                  title="Inbox"
                >
                  {inboxTable}
                </WorkspaceSurface>
              )}
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
            setSelectedTaskId={selectTaskFromTap}
          />
        ) : null}
      </div>

      <WorkspaceTaskRailAdapter
        selectionOrigin={
          selectedTask && selectedTask.id === tappedTaskId
            ? 'user'
            : 'automatic'
        }
        task={selectedTask}
        busyTaskId={busyTaskId}
        onKeepOutput={(taskId, outputId) =>
          mutateTask(taskId, (service) => service.keepOutput(taskId, outputId))
        }
        onClose={() => {
          setSelectedTaskId(null);
          replaceTaskSearchParam(null);
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
