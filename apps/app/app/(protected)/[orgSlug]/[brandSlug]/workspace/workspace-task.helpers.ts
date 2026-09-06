'use client';

import { useTaskStatusLabels } from '@app/(protected)/[orgSlug]/[brandSlug]/tasks/task-status.constants';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { VideoContinuityQaReport } from '@genfeedai/contracts/interfaces';
import type {
  InboxView,
  ReviewInboxSummary,
  WorkspaceAdvancedTool,
  WorkspaceInboxViewOption,
  WorkspaceLibrarySnapshotLink,
  WorkspaceSection,
  WorkspaceSectionCopyEntry,
  WorkspaceTaskRealtimePayload,
  WorkspaceTranslate,
} from '@props/workspace/workspace-task.props';
import {
  isTaskInWorkspaceInboxQueue,
  isUnreadWorkspaceInboxTask,
  Task,
  type TaskStatus,
} from '@services/management/tasks.service';
import { useTranslations } from 'next-intl';
import { buildTaskLaunchHref } from '@/lib/navigation/operator-shell';

export type {
  InboxView,
  ReviewInboxItem,
  ReviewInboxSummary,
  WorkspaceSection,
  WorkspaceTaskRealtimePayload,
} from '@props/workspace/workspace-task.props';

export const DEFAULT_REVIEW_INBOX: ReviewInboxSummary = {
  approvedCount: 0,
  changesRequestedCount: 0,
  pendingCount: 0,
  readyCount: 0,
  recentItems: [],
  rejectedCount: 0,
};

const INBOX_VIEW_OPTION_KEYS: WorkspaceInboxViewOption[] = [
  {
    descriptionKey: 'inbox.views.unread.description',
    id: 'unread',
    labelKey: 'inbox.views.unread.label',
  },
  {
    descriptionKey: 'inbox.views.recent.description',
    id: 'recent',
    labelKey: 'inbox.views.recent.label',
  },
  {
    descriptionKey: 'inbox.views.all.description',
    id: 'all',
    labelKey: 'inbox.views.all.label',
  },
];

export function useInboxViewOptions(): Array<{
  description: string;
  id: InboxView;
  label: string;
}> {
  const translate = useTranslations('pages.workspaceOverview');
  return INBOX_VIEW_OPTION_KEYS.map((option) => ({
    description: translate(option.descriptionKey),
    id: option.id,
    label: translate(option.labelKey),
  }));
}

const SECTION_COPY_KEYS: Record<WorkspaceSection, WorkspaceSectionCopyEntry> = {
  inbox: {
    descriptionKey: 'sections.inbox.description',
    titleKey: 'sections.inbox.title',
  },
  overview: {
    descriptionKey: 'sections.overview.description',
    titleKey: 'sections.overview.title',
  },
};

export function useWorkspaceSectionCopy(): Record<
  WorkspaceSection,
  { description: string; title: string }
> {
  const translate = useTranslations('pages.workspaceOverview');
  return {
    inbox: {
      description: translate(SECTION_COPY_KEYS.inbox.descriptionKey),
      title: translate(SECTION_COPY_KEYS.inbox.titleKey),
    },
    overview: {
      description: translate(SECTION_COPY_KEYS.overview.descriptionKey),
      title: translate(SECTION_COPY_KEYS.overview.titleKey),
    },
  };
}

const ADVANCED_TOOL_KEYS: WorkspaceAdvancedTool[] = [
  {
    descriptionKey: 'tools.agent.description',
    href: APP_ROUTES.AGENT.ROOT,
    labelKey: 'tools.agent.label',
  },
  {
    descriptionKey: 'tools.studio.description',
    href: APP_ROUTES.STUDIO.STORYBOARD,
    labelKey: 'tools.studio.label',
  },
  {
    descriptionKey: 'tools.workflows.description',
    href: APP_ROUTES.AUTOMATION.WORKFLOWS,
    labelKey: 'tools.workflows.label',
  },
  {
    descriptionKey: 'tools.runs.description',
    href: APP_ROUTES.AUTOMATION.RUNS,
    labelKey: 'tools.runs.label',
  },
];

export function useAdvancedTools(): Array<{
  description: string;
  href: string;
  label: string;
}> {
  const translate = useTranslations('pages.workspaceOverview');
  return ADVANCED_TOOL_KEYS.map((tool) => ({
    description: translate(tool.descriptionKey),
    href: tool.href,
    label: translate(tool.labelKey),
  }));
}

const LIBRARY_SNAPSHOT_LINK_KEYS: WorkspaceLibrarySnapshotLink[] = [
  {
    descriptionKey: 'library.overview.description',
    href: APP_ROUTES.LIBRARY.ASSETS,
    labelKey: 'library.overview.label',
  },
  {
    descriptionKey: 'library.media.description',
    href: APP_ROUTES.LIBRARY.IMAGES,
    labelKey: 'library.media.label',
  },
  {
    descriptionKey: 'library.audioCaptions.description',
    href: APP_ROUTES.LIBRARY.VOICES,
    labelKey: 'library.audioCaptions.label',
  },
];

export function useLibrarySnapshotLinks(): Array<{
  description: string;
  href: string;
  label: string;
}> {
  const translate = useTranslations('pages.workspaceOverview');
  return LIBRARY_SNAPSHOT_LINK_KEYS.map((link) => ({
    description: translate(link.descriptionKey),
    href: link.href,
    label: translate(link.labelKey),
  }));
}

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

/** Plain function (not a hook) so table `render` callbacks can call it too;
 * pass a `pages.workspaceOverview.relativeTime`-scoped translate. */
export function formatTaskTimestamp(
  task: Task,
  translate: WorkspaceTranslate,
): string {
  const source = task.updatedAt ?? task.createdAt;
  if (!source) {
    return translate('justNow');
  }

  const delta = Date.now() - new Date(source).getTime();
  const minutes = Math.floor(delta / 60_000);

  if (minutes < 1) {
    return translate('justNow');
  }

  if (minutes < 60) {
    return translate('minutesAgo', { minutes });
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return translate('hoursAgo', { hours });
  }

  return translate('daysAgo', { days: Math.floor(hours / 24) });
}

export function useTaskTimestamp(task: Task): string {
  const translate = useTranslations('pages.workspaceOverview.relativeTime');
  return formatTaskTimestamp(task, translate);
}

/** Canonical status token for the task pill; review states get their own tone. */
export function getTaskBadgeStatus(task: Task): string {
  if (task.dismissedAt != null) return 'cancelled';
  if (task.status === 'in_review' && task.reviewState === 'changes_requested') {
    return 'revision_requested';
  }
  return task.status;
}

/** Plain function (not a hook) so table `render` callbacks can call it too;
 * pass `useTaskStatusLabels()` and a `pages.tasks.status`-scoped translate. */
export function formatTaskStatus(
  task: Task,
  statusLabels: Record<TaskStatus, string>,
  translate: WorkspaceTranslate,
): string {
  if (task.dismissedAt != null) {
    return translate('dismissed');
  }
  if (task.status === 'in_review' && task.reviewState === 'changes_requested') {
    return translate('changesRequested');
  }
  // Same vocabulary as the tasks list and board.
  return statusLabels[task.status as TaskStatus] ?? task.status;
}

export function useTaskStatusLabel(task: Task): string {
  const statusLabels = useTaskStatusLabels();
  const translate = useTranslations('pages.tasks.status');
  return formatTaskStatus(task, statusLabels, translate);
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
