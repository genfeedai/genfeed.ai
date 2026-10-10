import type { ContentFormat, ReviewDecision, TurboRunItemStatus } from '../..';

export type ReviewTurboRunItemFormat =
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

export interface ManualReviewTurboRunItem {
  caption?: string;
  contentRunId?: string;
  creativeVersion?: string;
  format: ReviewTurboRunItemFormat;
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
  status: TurboRunItemStatus;
  variantId?: string;
  versionPinId?: string;
}
