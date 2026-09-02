import type { BatchItemStatus, ContentFormat, ReviewDecision } from '../..';

export type ReviewBatchItemFormat =
  | ContentFormat
  | 'article'
  | 'newsletter'
  | 'post';

export interface ManualReviewEvent {
  decision: ReviewDecision;
  feedback?: string;
  reviewedAt: Date;
  versionPinId?: string;
}

export interface ManualReviewBatchItem {
  caption?: string;
  contentRunId?: string;
  creativeVersion?: string;
  format: ReviewBatchItemFormat;
  gateOverallScore?: number;
  gateReasons: string[];
  hookVersion?: string;
  ingredientId?: string;
  mediaUrl?: string;
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
  platform?: string;
  postId?: string;
  publishIntent?: string;
  prompt?: string;
  reviewEvents: ManualReviewEvent[];
  scheduleSlot?: string;
  sourceActionId?: string;
  sourceWorkflowId?: string;
  sourceWorkflowName?: string;
  workflowExecutionId?: string;
  status: BatchItemStatus;
  variantId?: string;
  versionPinId?: string;
}
