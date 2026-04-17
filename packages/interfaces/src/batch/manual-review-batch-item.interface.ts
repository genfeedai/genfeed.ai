import type { BatchItemStatus, ContentFormat } from '@genfeedai/enums';

export type ReviewBatchItemFormat =
  | ContentFormat
  | 'article'
  | 'newsletter'
  | 'post';

export interface ManualReviewEvent {
  decision: 'approved' | 'rejected' | 'request_changes';
  feedback?: string;
  reviewedAt: Date;
}

export interface ManualReviewBatchItem {
  caption?: string;
  contentRunId?: string;
  creativeVersion?: string;
  format: ReviewBatchItemFormat;
  gateOverallScore?: number;
  gateReasons: string[];
  hookVersion?: string;
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
  status: BatchItemStatus;
  variantId?: string;
}
