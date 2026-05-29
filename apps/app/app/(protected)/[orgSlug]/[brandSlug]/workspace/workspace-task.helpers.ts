import { Task, type TaskEvent } from '@services/management/tasks.service';
import { buildTaskLaunchHref } from '@/lib/navigation/operator-shell';

export type WorkspaceSection = 'activity' | 'inbox' | 'overview';
export type InboxView = 'all' | 'recent' | 'unread';

export interface ReviewInboxItem {
  createdAt: string;
  format?: string;
  id: string;
  platform?: string;
  reviewDecision?: 'approved' | 'pending' | 'request_changes' | string;
  summary: string;
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
  activity: {
    description:
      'App activity, execution logs, and task progress across your account.',
    title: 'Activity',
  },
  inbox: {
    description: 'Unread work, recent movement, and the full queue.',
    title: 'Inbox',
  },
  overview: {
    description:
      'Tasks, approvals, live work, and operator handoffs in one control surface.',
    title: 'Workspace Dashboard',
  },
};

export const ADVANCED_TOOLS = [
  {
    description: 'All conversations and threads live here.',
    href: '/chat',
    label: 'Chat',
  },
  {
    description: 'Manual image generation and creative edits.',
    href: '/studio/image',
    label: 'Studio Image',
  },
  {
    description: 'Manual video generation and editing.',
    href: '/studio/video',
    label: 'Studio Video',
  },
  {
    description: 'Workflow builder for repeatable automation.',
    href: '/orchestration/workflows',
    label: 'Workflows',
  },
  {
    description: 'Operator view for live runs and execution state.',
    href: '/orchestration/runs',
    label: 'Runs',
  },
];

export const LIBRARY_SNAPSHOT_LINKS = [
  {
    description: 'Ingredients and reusable source material.',
    href: '/library/ingredients',
    label: 'Ingredients',
  },
  {
    description: 'Generated images, videos, and motion assets.',
    href: '/library/images',
    label: 'Media',
  },
  {
    description: 'Voice, music, and caption assets ready for reuse.',
    href: '/library/voices',
    label: 'Audio + captions',
  },
];

export const WORKSPACE_CARD_GRID_GAP_CLASS =
  'grid gap-3 md:grid-cols-2 xl:grid-cols-4';
export const WORKSPACE_SECTION_STACK_CLASS = 'space-y-4';

export function isTaskInInboxQueue(task: Task): boolean {
  return task.dismissedAt == null && task.reviewState !== 'dismissed';
}

export function isUnreadInboxTask(task: Task): boolean {
  return (
    task.reviewState === 'pending_approval' ||
    task.reviewState === 'changes_requested' ||
    task.status === 'backlog' ||
    task.status === 'in_progress' ||
    task.status === 'in_review' ||
    task.status === 'failed'
  );
}

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
