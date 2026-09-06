import type { ReviewDecision } from '@genfeedai/contracts';
import type { VideoContinuityQaReport } from '@genfeedai/contracts/interfaces';
import type { Task, TaskEvent } from '@services/management/tasks.service';

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
