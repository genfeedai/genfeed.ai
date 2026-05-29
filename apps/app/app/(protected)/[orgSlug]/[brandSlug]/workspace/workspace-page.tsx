'use client';

import { useAuth } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IAgentRun, IAnalytics } from '@genfeedai/interfaces';
import type { AgentRunStats } from '@genfeedai/types';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import { Task, TasksService } from '@services/management/tasks.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Card from '@ui/card/Card';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { WebSocketPaths } from '@utils/network/websocket.util';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type ReactNode,
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentCheck,
  HiOutlineInboxStack,
  HiOutlineSquares2X2,
} from 'react-icons/hi2';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { OPERATOR_TASK_CONTEXT_QUERY_KEYS } from '@/lib/navigation/operator-shell';
import { OPEN_TASK_COMPOSER_EVENT } from '@/lib/workspace/task-composer-events';
import { WorkspaceDashboard } from './workspace-dashboard';
import {
  ADVANCED_TOOLS,
  applyRealtimeTaskUpdate,
  DEFAULT_REVIEW_INBOX,
  formatTaskStatus,
  formatTaskTimestamp,
  getTaskStateDotClass,
  INBOX_VIEW_OPTIONS,
  type InboxView,
  isTaskInInboxQueue,
  isUnreadInboxTask,
  LIBRARY_SNAPSHOT_LINKS,
  type ReviewInboxSummary,
  SECTION_COPY,
  WORKSPACE_CARD_GRID_GAP_CLASS,
  WORKSPACE_SECTION_STACK_CLASS,
  type WorkspaceSection,
  type WorkspaceTaskRealtimePayload,
} from './workspace-task.helpers';
import { WorkspaceTaskCard } from './workspace-task-card';
import { WorkspaceTaskInspector } from './workspace-task-inspector';
import { WorkspaceTaskRow } from './workspace-task-row';

const WorkspaceTaskComposer = dynamic(
  () =>
    import('./workspace-task-composer').then(
      (module) => module.WorkspaceTaskComposer,
    ),
  { ssr: false },
);

const EMPTY_AGENT_RUNS: IAgentRun[] = [];

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
  void initialAnalytics;
  void initialTimeSeriesData;

  const { getToken } = useAuth();
  const { subscribe } = useSocketManager();
  const { organizationId } = useBrand();
  const pathname = usePathname();
  const { push, replace } = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const requestedTaskId = searchParams.get('taskId');
  const [isTaskComposerOpen, setTaskComposerOpen] = useState(false);
  const [workspaceActionError, setWorkspaceActionError] = useState<
    string | null
  >(null);
  const [isWorkspaceRefreshing, setWorkspaceRefreshing] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [workspaceTasks, setWorkspaceTasks] = useState<Task[]>([]);

  const reviewInboxTasks = useMemo(
    () =>
      workspaceTasks.filter(
        (task) =>
          task.reviewState === 'pending_approval' ||
          task.reviewState === 'changes_requested' ||
          task.status === 'done' ||
          task.status === 'failed',
      ),
    [workspaceTasks],
  );

  const queueTasks = useMemo(
    () =>
      workspaceTasks
        .filter(isTaskInInboxQueue)
        .slice()
        .sort((left, right) => {
          const leftTime = new Date(
            left.updatedAt ?? left.createdAt ?? 0,
          ).getTime();
          const rightTime = new Date(
            right.updatedAt ?? right.createdAt ?? 0,
          ).getTime();
          return rightTime - leftTime;
        }),
    [workspaceTasks],
  );

  const unreadInboxTasks = useMemo(
    () => queueTasks.filter(isUnreadInboxTask),
    [queueTasks],
  );

  const recentInboxTasks = useMemo(() => queueTasks.slice(0, 8), [queueTasks]);

  const inProgressTasks = useMemo(
    () =>
      workspaceTasks.filter(
        (task) => task.status === 'backlog' || task.status === 'in_progress',
      ),
    [workspaceTasks],
  );

  const activityItems = useMemo(
    () =>
      workspaceTasks.slice().sort((left, right) => {
        const leftTime = new Date(
          left.updatedAt ?? left.createdAt ?? 0,
        ).getTime();
        const rightTime = new Date(
          right.updatedAt ?? right.createdAt ?? 0,
        ).getTime();
        return rightTime - leftTime;
      }),
    [workspaceTasks],
  );
  const historyPreviewItems = useMemo(
    () => activityItems.slice(0, 5),
    [activityItems],
  );
  const selectedTask = useMemo(
    () => workspaceTasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, workspaceTasks],
  );
  const replaceTaskSearchParam = useCallback(
    (taskId: string | null) => {
      const nextSearchParams = new URLSearchParams(searchParamsString);

      for (const key of OPERATOR_TASK_CONTEXT_QUERY_KEYS) {
        if (key !== 'taskId') {
          nextSearchParams.delete(key);
        }
      }

      if (taskId) {
        nextSearchParams.set('taskId', taskId);
      } else {
        nextSearchParams.delete('taskId');
      }

      const nextQuery = nextSearchParams.toString();
      replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );
  const visibleInboxTasks = useMemo(() => {
    switch (defaultInboxView) {
      case 'unread':
        return unreadInboxTasks;
      case 'all':
        return queueTasks;
      default:
        return recentInboxTasks;
    }
  }, [defaultInboxView, queueTasks, recentInboxTasks, unreadInboxTasks]);

  const summaryItems = useMemo(
    () => [
      {
        label: 'Unread',
        value: String(unreadInboxTasks.length),
      },
      {
        label: 'In Progress',
        value: String(inProgressTasks.length + initialActiveRuns.length),
      },
      {
        label: 'Completed Today',
        value: String(initialStats?.completedToday ?? 0),
      },
      {
        label: 'Failed Today',
        value: String(initialStats?.failedToday ?? 0),
      },
    ],
    [
      initialActiveRuns.length,
      initialStats,
      inProgressTasks.length,
      unreadInboxTasks.length,
    ],
  );

  useEffect(() => {
    if (
      selectedTaskId &&
      !workspaceTasks.some((task) => task.id === selectedTaskId)
    ) {
      setSelectedTaskId(null);
    }
  }, [selectedTaskId, workspaceTasks]);

  useEffect(() => {
    if (!requestedTaskId) {
      return;
    }

    if (!workspaceTasks.some((task) => task.id === requestedTaskId)) {
      return;
    }

    if (selectedTaskId === requestedTaskId) {
      return;
    }

    setSelectedTaskId(requestedTaskId);
  }, [requestedTaskId, selectedTaskId, workspaceTasks]);

  useEffect(() => {
    const controller = new AbortController();

    const loadWorkspaceTasks = async () => {
      const token = await resolveClerkToken(getToken);
      if (!token || controller.signal.aborted) {
        return;
      }

      const service = TasksService.getInstance(token);
      const tasks = await service.list({});
      if (!controller.signal.aborted) {
        setWorkspaceTasks(tasks);
      }
    };

    void loadWorkspaceTasks();

    return () => {
      controller.abort();
    };
  }, [getToken]);

  useEffect(() => {
    if (!organizationId) {
      return;
    }

    const unsubscribeOverview = subscribe<WorkspaceTaskRealtimePayload>(
      WebSocketPaths.workspaceTaskOverview(organizationId),
      (payload) => {
        startTransition(() => {
          setWorkspaceTasks((current) =>
            applyRealtimeTaskUpdate(current, payload),
          );
        });
      },
    );

    return () => {
      unsubscribeOverview();
    };
  }, [organizationId, subscribe]);

  const refreshWorkspaceTasks = async () => {
    setWorkspaceRefreshing(true);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        return;
      }

      const service = TasksService.getInstance(token);
      const tasks = await service.list({});
      startTransition(() => {
        setWorkspaceTasks(tasks);
      });
    } finally {
      setWorkspaceRefreshing(false);
    }
  };

  const mutateTask = async (
    taskId: string,
    operation: (service: TasksService) => Promise<Task>,
  ) => {
    setBusyTaskId(taskId);
    setWorkspaceActionError(null);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        return;
      }

      const service = TasksService.getInstance(token);
      const updatedTask = await operation(service);
      startTransition(() => {
        setWorkspaceTasks((current) =>
          current.map((task) =>
            task.id === updatedTask.id ? updatedTask : task,
          ),
        );
      });
    } catch (error) {
      setWorkspaceActionError(
        error instanceof Error
          ? error.message
          : 'Failed to update the workspace task.',
      );
    } finally {
      setBusyTaskId(null);
    }
  };

  const openPlanningConversation = async (task: Task) => {
    setBusyTaskId(task.id);
    setWorkspaceActionError(null);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        setWorkspaceActionError('Authentication token unavailable.');
        return;
      }

      const service = TasksService.getInstance(token);
      const planningThread = await service.ensurePlanningThread(task.id);

      startTransition(() => {
        setWorkspaceTasks((current) =>
          current.map((item) =>
            item.id === task.id
              ? new Task({
                  ...item,
                  planningThreadId: planningThread.threadId,
                })
              : item,
          ),
        );
      });

      push(`/chat/${planningThread.threadId}`);
    } catch (error) {
      setWorkspaceActionError(
        error instanceof Error
          ? error.message
          : 'Failed to open the planning conversation.',
      );
    } finally {
      setBusyTaskId(null);
    }
  };

  const isOverviewSection = section === 'overview';
  const isInboxSection = section === 'inbox';
  const sectionCopy = SECTION_COPY[section];
  const shouldShowComposer = false;
  const shouldShowInbox = section === 'overview' || section === 'inbox';
  const shouldShowHistory = false;
  const shouldShowSectionSnapshot = section === 'inbox';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const openComposerFromSidebar = () => {
      setTaskComposerOpen(true);
    };

    window.addEventListener(OPEN_TASK_COMPOSER_EVENT, openComposerFromSidebar);

    return () => {
      window.removeEventListener(
        OPEN_TASK_COMPOSER_EVENT,
        openComposerFromSidebar,
      );
    };
  }, []);

  const renderTaskStream = (tasks: Task[], emptyMessage: string): ReactNode =>
    tasks.length > 0 ? (
      <div className="divide-y divide-white/[0.06]">
        {tasks.map((task) => (
          <WorkspaceTaskCard
            key={task.id}
            task={task}
            busyTaskId={busyTaskId}
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
          />
        ))}
      </div>
    ) : (
      <p className="text-sm text-foreground/45">{emptyMessage}</p>
    );

  const renderTaskRows = (tasks: Task[], emptyMessage: string): ReactNode =>
    tasks.length > 0 ? (
      <div className="divide-y divide-white/[0.06]">
        {tasks.map((task) => (
          <WorkspaceTaskRow
            key={task.id}
            task={task}
            onOpen={(openedTask) => {
              setSelectedTaskId(openedTask.id);
              replaceTaskSearchParam(openedTask.id);
            }}
          />
        ))}
      </div>
    ) : (
      <AppTable<Task> items={[]} columns={[]} emptyLabel={emptyMessage} />
    );

  const workspaceHeaderActions = (
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
  );

  return (
    <Container
      label={sectionCopy.title}
      description={sectionCopy.description}
      icon={HiOutlineSquares2X2}
      promoteHeaderToTopbarOnScroll
      topbarRight={workspaceHeaderActions}
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
      right={workspaceHeaderActions}
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
          reviewInbox={initialReviewInbox}
          runs={initialRuns}
          stats={initialStats}
          workspaceTasks={workspaceTasks}
        />
      ) : null}

      {shouldShowSectionSnapshot ? (
        <section data-testid="workspace-snapshot" className="space-y-3 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Workspace at a glance
            </h2>
          </div>
          <div className={WORKSPACE_CARD_GRID_GAP_CLASS}>
            {summaryItems.map((item) => (
              <Card
                key={item.label}
                className="h-full"
                bodyClassName="space-y-1 p-3"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                  {item.label}
                </p>
                <div className="text-xl font-semibold tracking-[-0.02em] text-foreground">
                  {item.value}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <div className={WORKSPACE_SECTION_STACK_CLASS}>
        <div className={WORKSPACE_SECTION_STACK_CLASS}>
          {isOverviewSection ? (
            <section id="task-queue" data-testid="workspace-task-list">
              <Card
                label="Task queue"
                description="Recent task requests across triage, active work, review, and completed output."
                bodyClassName="space-y-3 p-4"
              >
                {renderTaskStream(
                  activityItems,
                  'No tasks yet. Start the first one from New Task.',
                )}
              </Card>
            </section>
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
                columns={[
                  {
                    key: 'title',
                    header: 'Task',
                    render: (task) => (
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            getTaskStateDotClass(task),
                          )}
                        />
                        <span className="truncate font-medium text-foreground">
                          {task.title}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    className: 'w-32',
                    render: (task) => (
                      <span className="text-xs text-foreground/60">
                        {formatTaskStatus(task)}
                      </span>
                    ),
                  },
                  {
                    key: 'executionPathUsed',
                    header: 'Path',
                    className: 'w-36 hidden lg:table-cell',
                    render: (task) => (
                      <span className="text-xs text-foreground/45">
                        {task.executionPathUsed?.replaceAll('_', ' ') ?? ':'}
                      </span>
                    ),
                  },
                  {
                    key: 'updatedAt',
                    header: 'Updated',
                    className: 'w-28 text-right',
                    render: (task) => (
                      <span className="text-xs text-foreground/40">
                        {formatTaskTimestamp(task)}
                      </span>
                    ),
                  },
                ]}
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
                columns={[
                  {
                    key: 'title',
                    header: 'Task',
                    render: (task) => (
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            getTaskStateDotClass(task),
                          )}
                        />
                        <span className="truncate font-medium text-foreground">
                          {task.title}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    className: 'w-32',
                    render: (task) => (
                      <span className="text-xs text-foreground/60">
                        {formatTaskStatus(task)}
                      </span>
                    ),
                  },
                  {
                    key: 'executionPathUsed',
                    header: 'Path',
                    className: 'w-36 hidden lg:table-cell',
                    render: (task) => (
                      <span className="text-xs text-foreground/45">
                        {task.executionPathUsed?.replaceAll('_', ' ') ?? ':'}
                      </span>
                    ),
                  },
                  {
                    key: 'updatedAt',
                    header: 'Updated',
                    className: 'w-28 text-right',
                    render: (task) => (
                      <span className="text-xs text-foreground/40">
                        {formatTaskTimestamp(task)}
                      </span>
                    ),
                  },
                ]}
              />
            </section>
          ) : null}
        </div>

        {isOverviewSection ? (
          <div className={WORKSPACE_SECTION_STACK_CLASS}>
            <section data-testid="workspace-in-progress">
              <Card
                label="In progress"
                description="Active workspace tasks and live execution state."
                bodyClassName="space-y-3 p-4"
              >
                {renderTaskStream(
                  inProgressTasks,
                  'No active workspace tasks right now.',
                )}

                <div className="border-t border-white/[0.06] pt-4">
                  <div className="flex items-center justify-between text-sm text-foreground/55">
                    <span>Live runs</span>
                    <span>{initialActiveRuns.length}</span>
                  </div>
                </div>
              </Card>
            </section>

            <section data-testid="workspace-recent-outputs">
              <Card
                label="Recent outputs"
                description="Latest generated ingredients and posts."
                bodyClassName="p-4"
              >
                {initialReviewInbox.recentItems.length > 0 ? (
                  <div className="divide-y divide-white/[0.06]">
                    {initialReviewInbox.recentItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">
                            {item.summary}
                          </p>
                          <p className="text-sm text-foreground/55">
                            {item.format}
                            {item.platform ? ` on ${item.platform}` : ''}
                          </p>
                          <p className="text-xs text-foreground/40">
                            <ClientFormattedDate value={item.createdAt} />
                          </p>
                        </div>
                        {item.reviewDecision === 'approved' ? (
                          <HiOutlineCheckCircle className="size-5 text-emerald-300" />
                        ) : item.reviewDecision === 'request_changes' ? (
                          <HiOutlineClipboardDocumentCheck className="size-5 text-amber-300" />
                        ) : (
                          <HiOutlineInboxStack className="size-5 text-foreground/40" />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-foreground/45">
                    Recent outputs will appear here once the workspace starts
                    routing work.
                  </p>
                )}
              </Card>
            </section>

            <section data-testid="workspace-history-preview">
              <Card
                label="Recent activity"
                description="Execution logs stay available without owning the main navigation."
                headerAction={
                  <Button
                    asChild
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                  >
                    <Link href="/workspace/inbox/unread">Open Inbox</Link>
                  </Button>
                }
                bodyClassName="p-4"
              >
                {renderTaskRows(
                  historyPreviewItems,
                  'Activity will appear here once the workspace starts routing work.',
                )}
              </Card>
            </section>

            <section data-testid="workspace-library-snapshot">
              <Card
                label="Library snapshot"
                description="Keep the ingredient library one click away from the dashboard."
                bodyClassName="p-4"
              >
                <div className="divide-y divide-white/[0.06]">
                  {LIBRARY_SNAPSHOT_LINKS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block py-4 first:pt-0 last:pb-0"
                    >
                      <p className="text-sm font-semibold text-foreground">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm text-foreground/55">
                        {item.description}
                      </p>
                    </Link>
                  ))}
                </div>
              </Card>
            </section>

            <section data-testid="workspace-advanced-tools">
              <Card
                label="Operator tools"
                description="Manual and expert surfaces stay available without owning the main navigation."
                bodyClassName="p-4"
              >
                <div className="divide-y divide-white/[0.06]">
                  {ADVANCED_TOOLS.map((tool) => (
                    <Link
                      key={tool.href}
                      href={tool.href}
                      aria-label={tool.label}
                      className="block py-4 first:pt-0 last:pb-0"
                    >
                      <p className="text-sm font-semibold text-foreground">
                        {tool.label}
                      </p>
                      <p className="mt-1 text-sm text-foreground/55">
                        {tool.description}
                      </p>
                    </Link>
                  ))}
                </div>
              </Card>
            </section>
          </div>
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
