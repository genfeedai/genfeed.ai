'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type { IAgentRun, IAnalytics } from '@genfeedai/interfaces';
import type { AgentRunStats } from '@genfeedai/types';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import { AgentRunsService } from '@services/ai/agent-runs.service';
import { Task, TasksService } from '@services/management/tasks.service';
import { WebSocketPaths } from '@utils/network/websocket.util';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { OPERATOR_TASK_CONTEXT_QUERY_KEYS } from '@/lib/navigation/operator-shell';
import { OPEN_TASK_COMPOSER_EVENT } from '@/lib/workspace/task-composer-events';
import {
  applyRealtimeTaskUpdate,
  DEFAULT_REVIEW_INBOX,
  EMPTY_AGENT_RUNS,
  type InboxView,
  isTaskInInboxQueue,
  isUnreadInboxTask,
  type ReviewInboxSummary,
  SECTION_COPY,
  type WorkspaceSection,
  type WorkspaceTaskRealtimePayload,
} from './workspace-task.helpers';

export interface UseWorkspacePageContentParams {
  defaultInboxView?: InboxView;
  initialActiveRuns?: IAgentRun[];
  initialAnalytics?: Partial<IAnalytics>;
  initialReviewInbox?: ReviewInboxSummary;
  initialRuns?: IAgentRun[];
  initialStats?: AgentRunStats | null;
  initialTimeSeriesData?: PlatformTimeSeriesDataPoint[];
  section?: WorkspaceSection;
}

export function useWorkspacePageContent({
  defaultInboxView = 'unread',
  initialActiveRuns = EMPTY_AGENT_RUNS,
  initialAnalytics,
  initialReviewInbox = DEFAULT_REVIEW_INBOX,
  initialRuns = EMPTY_AGENT_RUNS,
  initialStats = null,
  initialTimeSeriesData,
  section = 'overview',
}: UseWorkspacePageContentParams) {
  void initialAnalytics;
  void initialTimeSeriesData;

  const { getToken } = useAuthIdentity();
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
  const [activeRuns, setActiveRuns] = useState<IAgentRun[]>(initialActiveRuns);
  const [agentRuns, setAgentRuns] = useState<IAgentRun[]>(initialRuns);
  const [agentStats, setAgentStats] = useState<AgentRunStats | null>(
    initialStats,
  );
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
        value: String(inProgressTasks.length + activeRuns.length),
      },
      {
        label: 'Completed Today',
        value: String(agentStats?.completedToday ?? 0),
      },
      {
        label: 'Failed Today',
        value: String(agentStats?.failedToday ?? 0),
      },
    ],
    [
      activeRuns.length,
      agentStats,
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
      const token = await resolveAuthToken(getToken);
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
    if (section !== 'overview') {
      return;
    }

    let isMounted = true;

    const loadWorkspaceRuns = async () => {
      const token = await resolveAuthToken(getToken);
      if (!token || !isMounted) {
        return;
      }

      const service = AgentRunsService.getInstance(token);
      const [runsResult, activeRunsResult, statsResult] =
        await Promise.allSettled([
          service.list({ page: 1 }),
          service.getActive(),
          service.getStats(),
        ]);

      if (!isMounted) {
        return;
      }

      startTransition(() => {
        if (runsResult.status === 'fulfilled') {
          setAgentRuns(runsResult.value);
        }
        if (activeRunsResult.status === 'fulfilled') {
          setActiveRuns(activeRunsResult.value);
        }
        if (statsResult.status === 'fulfilled') {
          setAgentStats(statsResult.value);
        }
      });
    };

    void loadWorkspaceRuns();

    return () => {
      isMounted = false;
    };
  }, [getToken, section]);

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

  const refreshWorkspaceTasks = async () => {
    setWorkspaceRefreshing(true);

    try {
      const token = await resolveAuthToken(getToken);
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
      const token = await resolveAuthToken(getToken);
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
      const token = await resolveAuthToken(getToken);
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
              ? new Task({ ...item, planningThreadId: planningThread.threadId })
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

  return {
    activityItems,
    busyTaskId,
    defaultInboxView,
    historyPreviewItems,
    inProgressTasks,
    initialActiveRuns: activeRuns,
    initialReviewInbox,
    initialRuns: agentRuns,
    initialStats: agentStats,
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
    section,
    sectionCopy,
    selectedTask,
    selectedTaskId,
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
    workspaceActionError,
    workspaceTasks,
  };
}
