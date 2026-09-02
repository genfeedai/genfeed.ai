import type { ReviewDecision } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { VideoContinuityQaReport } from '@genfeedai/contracts/interfaces';
import {
  isTaskInWorkspaceInboxQueue,
  isUnreadWorkspaceInboxTask,
  Task,
  type TaskEvent,
} from '@services/management/tasks.service';
import { buildTaskLaunchHref } from '@/lib/navigation/operator-shell';

export type WorkspaceSection = 'inbox' | 'overview';
export type InboxView = 'all' | 'recent' | 'unread';

export interface ReviewInboxItem {
  createdAt: string;
  format?: string;
  id: string;
  platform?: string;
  reviewDecision: ReviewDecision;
  summary: string;
  continuityQa?: VideoContinuityQaReport;
}

export interface ReviewInboxSummary {
  approvedCount: number;
  changesRequestedCount: number;
  pendingCount: number;
  readyCount: number;
  recentItems: ReviewInboxItem[];
  rejectedCount: number;
}

export interface WorkspaceTaskRealtimePayload {
  event: TaskEvent;
  organizationId: string;
  task: Task;
  taskId: string;
}

export const DEFAULT_REVIEW_INBOX: ReviewInboxSummary = {
  approvedCount: 0,
  changesRequestedCount: 0,
  pendingCount: 0,
  readyCount: 0,
  recentItems: [],
  rejectedCount: 0,
};

export const INBOX_VIEW_OPTIONS: Array<{
  description: string;
  id: InboxView;
  label: string;
}> = [
  {
    description: 'Items that still need operator attention.',
    id: 'unread',
    label: 'Unread',
  },
  {
    description: 'Latest queue movement, regardless of status.',
    id: 'recent',
    label: 'Recent',
  },
  {
    description: 'Everything in the workspace queue, including done items.',
    id: 'all',
    label: 'All',
  },
];

export const SECTION_COPY: Record<
  WorkspaceSection,
  { description: string; title: string }
> = {
  inbox: {
    description: 'Unread work, recent movement, and the full queue.',
    title: 'Inbox',
  },
  overview: {
    description:
      'Tasks, approvals, live work, and operator handoffs in one control surface.',
    title: 'Overview',
  },
};

export const ADVANCED_TOOLS = [
  {
    description: 'All conversations and threads live here.',
    href: APP_ROUTES.AGENT.ROOT,
    label: 'Agent',
  },
  {
    description: 'Storyboard, clips, and batch production surfaces.',
    href: APP_ROUTES.STUDIO.STORYBOARD,
    label: 'Studio',
  },
  {
    description: 'Workflow builder for repeatable automation.',
    href: APP_ROUTES.AUTOMATION.WORKFLOWS,
    label: 'Workflows',
  },
  {
    description: 'Operator view for live runs and execution state.',
    href: APP_ROUTES.AUTOMATION.RUNS,
    label: 'Runs',
  },
];

export const LIBRARY_SNAPSHOT_LINKS = [
  {
    description: 'Browse every reusable source and generated asset.',
    href: APP_ROUTES.LIBRARY.ASSETS,
    label: 'Overview',
  },
  {
    description: 'Generated images, videos, and motion assets.',
    href: APP_ROUTES.LIBRARY.IMAGES,
    label: 'Media',
  },
  {
    description: 'Voice, music, and caption assets ready for reuse.',
    href: APP_ROUTES.LIBRARY.VOICES,
    label: 'Audio + captions',
  },
];

export const WORKSPACE_CARD_GRID_GAP_CLASS =
  'grid gap-3 md:grid-cols-2 xl:grid-cols-4';
export const WORKSPACE_SECTION_STACK_CLASS = 'space-y-4';

export const isTaskInInboxQueue = isTaskInWorkspaceInboxQueue;

export function getTaskContinuityQa(
  task: Task,
): VideoContinuityQaReport | undefined {
  const candidate = task.decomposition?.continuityQa;
  return isVideoContinuityQaReport(candidate) ? candidate : undefined;
}

export function isVideoContinuityQaReport(
  value: unknown,
): value is VideoContinuityQaReport {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).schemaVersion === 1 &&
    Array.isArray((value as Record<string, unknown>).clips)
  );
}

export const isUnreadInboxTask = isUnreadWorkspaceInboxTask;

export function formatTaskTimestamp(task: Task): string {
  const source = task.updatedAt ?? task.createdAt;
  if (!source) {
    return 'just now';
  }

  const delta = Date.now() - new Date(source).getTime();
  const minutes = Math.floor(delta / 60_000);

  if (minutes < 1) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}

export function formatTaskStatus(task: Task): string {
  if (task.dismissedAt != null) {
    return 'Dismissed';
  }

  switch (task.status) {
    case 'done':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'in_review':
      return task.reviewState === 'changes_requested'
        ? 'Changes Requested'
        : 'Needs Review';
    case 'in_progress':
      return 'In Progress';
    case 'backlog':
      return 'Triaged';
    default:
      return task.status;
  }
}

export function getAdvancedToolHref(task: Task): string {
  return buildTaskLaunchHref(task, 'auto');
}

export function getTaskStateDotClass(task: Task): string {
  if (task.status === 'failed') {
    return 'bg-rose-400';
  }

  if (
    task.reviewState === 'pending_approval' ||
    task.reviewState === 'changes_requested' ||
    task.status === 'in_review'
  ) {
    return 'bg-amber-300';
  }

  if (task.status === 'done') {
    return 'bg-emerald-300';
  }

  return 'bg-sky-300';
}

export function applyRealtimeTaskUpdate(
  currentTasks: Task[],
  payload: WorkspaceTaskRealtimePayload,
): Task[] {
  const nextTask = new Task(payload.task);
  const existingIndex = currentTasks.findIndex(
    (task) => task.id === payload.taskId,
  );

  if (existingIndex === -1) {
    return [nextTask, ...currentTasks];
  }

  return currentTasks.map((task, index) =>
    index === existingIndex ? nextTask : task,
  );
}
