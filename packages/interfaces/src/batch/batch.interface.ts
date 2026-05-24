import type {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  ReferenceImageCategory,
} from '@genfeedai/enums';

export type BatchItemFormat = ContentFormat | 'article' | 'newsletter' | 'post';

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
export interface IBatchGenerationRequest {
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
export interface IBatchItem {
  id: string;
  batchId: string;
  format: BatchItemFormat;
  status: BatchItemStatus;
  prompt?: string;
  caption?: string;
  mediaUrl?: string;
  postId?: string;
  platform?: string;
  scheduledDate?: string;
  error?: string;
  reviewDecision?: 'approved' | 'rejected' | 'request_changes';
  reviewFeedback?: string;
  reviewedAt?: string;
  reviewEvents?: Array<{
    decision: 'approved' | 'rejected' | 'request_changes';
    feedback?: string;
    reviewedAt: string;
  }>;
  sourceActionId?: string;
  sourceWorkflowId?: string;
  sourceWorkflowName?: string;
  type?: 'content' | 'engagement';
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

/**
 * Summary of a batch generation job with all items
 */
export interface IBatchSummary {
  id: string;
  status: BatchStatus;
  totalCount: number;
  totalItems?: number;
  completedCount: number;
  completedItems?: number;
  failedCount: number;
  pendingCount: number;
  brandId: string;
  platforms: string[];
  contentMix: IContentMixConfig;
  items: IBatchItem[];
  createdAt: string;
  completedAt?: string;
}
