import type { Task } from '@genfeedai/prisma';

export type WorkspaceTaskEvent = {
  id: string;
  payload?: Record<string, unknown>;
  timestamp: Date;
  type: string;
};

export type WorkspaceTaskProgress = {
  activeRunCount: number;
  message?: string;
  percent: number;
  stage?: string;
};

export interface WorkspaceTaskDocument extends Task {
  _id: string;
  approvedOutputIds: string[];
  brand?: string;
  chosenModel?: string;
  chosenProvider?: string;
  completedAt?: Date;
  decomposition?: Record<string, unknown>;
  dismissedAt?: Date;
  eventStream: WorkspaceTaskEvent[];
  executionPathUsed?: string;
  failureReason?: string;
  linkedApprovalIds: string[];
  linkedIssueId?: string;
  linkedOutputIds: string[];
  linkedRunIds: string[];
  organization: string;
  outputType:
    | 'caption'
    | 'image'
    | 'ingredient'
    | 'newsletter'
    | 'post'
    | 'video';
  platforms: string[];
  planningThreadId?: string;
  qualityAssessment?: Record<string, unknown>;
  request: string;
  requestedChangesReason?: string;
  resultPreview?: string;
  reviewState: string;
  reviewTriggered: boolean;
  routingSummary?: string;
  skillVariantIds: string[];
  skillsUsed: string[];
  status: string;
  title: string;
  user: string;
}
