import type { ReviewDecision } from '@genfeedai/contracts';
import type { VideoContinuityQaReport } from '@genfeedai/contracts/interfaces';
import type { Task, TaskEvent } from '@services/management/tasks.service';

export type WorkspaceSection = 'inbox' | 'overview';
export type InboxView = 'all' | 'recent' | 'unread';

/** Narrow call signature a `next-intl` `useTranslations` result satisfies,
 * for passing translation into a plain helper function that cannot call
 * hooks itself (e.g. a table column `render` callback). Deliberately not
 * `ReturnType<typeof useTranslations>` — that type also carries `.rich`/
 * `.markup`/`.raw`, which a plain callback passed in its place would not
 * implement. */
export type WorkspaceTranslate = (
  key: string,
  values?: Record<string, number | string>,
) => string;

export interface WorkspaceInboxViewOption {
  descriptionKey: string;
  id: InboxView;
  labelKey: string;
}

export interface WorkspaceSectionCopyEntry {
  descriptionKey: string;
  titleKey: string;
}

export interface WorkspaceAdvancedTool {
  descriptionKey: string;
  href: string;
  labelKey: string;
}

export interface WorkspaceLibrarySnapshotLink {
  descriptionKey: string;
  href: string;
  labelKey: string;
}

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
