import type {
  TurboRunItemStatus,
  TurboRunStatus,
  ContentFormat,
  ReferenceImageCategory,
  ReviewDecision,
} from '../..';
import type { IPublishApproval } from '../publisher/publish-approval.interface';

export type TurboRunItemFormat = ContentFormat | 'article' | 'newsletter' | 'post';

/**
 * Reference image attached to a brand for consistent generation
 */
export interface IBrandReferenceImage {
  url: string;
  category: ReferenceImageCategory;
  label?: string;
  isDefault?: boolean;
}

/**
 * Content mix distribution (percentages must sum to 100)
 */
export interface IContentMixConfig {
  imagePercent: number;
  videoPercent: number;
  carouselPercent: number;
  reelPercent: number;
  storyPercent: number;
}

/**
 * Request to create a batch generation job
 */
export interface ITurboRunRequest {
  count: number;
  brandId: string;
  platforms: string[];
  topics?: string[];
  contentMix?: IContentMixConfig;
  dateRange: {
    start: string;
    end: string;
  };
  style?: string;
  referenceImages?: string[];
}

/**
 * Single item within a batch generation job
 */
export interface ITurboRunItem {
  id: string;
  turboRunId: string;
  format: TurboRunItemFormat;
  status: TurboRunItemStatus;
  prompt?: string;
  caption?: string;
  contentRunId?: string;
  creativeVersion?: string;
  ingredientId?: string;
  mediaUrl?: string;
  postId?: string;
  platform?: string;
  scheduledDate?: string;
  error?: string;
  /** Optional only for legacy payload compatibility; readers normalize absence to `unset`. */
  reviewDecision?: ReviewDecision;
  reviewFeedback?: string;
  reviewedAt?: string;
  reviewEvents?: ITurboRunReviewEvent[];
  assigneeId?: string | null;
  assignee?: ITurboRunItemAssignee | null;
  versionPinId?: string;
  variantId?: string;
  publishApproval?: IPublishApproval;
  sourceActionId?: string;
  sourceWorkflowId?: string;
  sourceWorkflowName?: string;
  workflowExecutionId?: string;
  type?: 'content' | 'engagement';
  /** Quote/repost/reply distinction for an engagement item, when known. */
  engagementAction?: string;
  targetPostId?: string;
  targetPostUrl?: string;
  targetAuthor?: string;
  targetPostContent?: string;
  postGenerationId?: string;
  postStatus?: string;
  postExternalId?: string;
  postPublishedAt?: string;
  postLastAttemptAt?: string;
  postRetryCount?: number;
  postTotalViews?: number;
  postTotalLikes?: number;
  postTotalComments?: number;
  postTotalShares?: number;
  postAvgEngagementRate?: number;
  postUrl?: string;
  createdAt: string;
}

export interface ITurboRunItemAssignee {
  displayName: string;
  handle: string;
  id: string;
}

export interface ITurboRunReviewEventReviewer {
  avatar?: string;
  displayName: string;
  handle: string;
  id: string;
}

export interface ITurboRunReviewEvent {
  decision: ReviewDecision;
  feedback?: string;
  reviewedAt: string;
  reviewer?: ITurboRunReviewEventReviewer;
  reviewerId?: string;
  versionPinId?: string;
}

/**
 * Summary of a batch generation job with all items
 */
export interface ITurboRunSummary {
  id: string;
  status: TurboRunStatus;
  totalCount: number;
  totalItems?: number;
  completedCount: number;
  completedItems?: number;
  failedCount: number;
  pendingCount: number;
  brandId: string;
  platforms: string[];
  contentMix: IContentMixConfig;
  items: ITurboRunItem[];
  createdAt: string;
  completedAt?: string;
}
