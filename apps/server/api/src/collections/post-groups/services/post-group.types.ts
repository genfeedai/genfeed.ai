import type {
  CredentialPlatform,
  PostCategory,
  PostVisibility,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  ChannelTargetInput,
  CreateReleaseGroupInput,
  UpdateChannelTargetInput,
} from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type {
  IPublishApproval,
  IReleaseGroup,
  PostGroupCreateProvenance,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

export type SchedulerTx = Prisma.TransactionClient;

export type SchedulerCredential = {
  brandId: string | null;
  id: string;
  isConnected: boolean;
  organizationId: string | null;
  platform: string;
};

export type SchedulerPostGroup = {
  attachments: Prisma.JsonValue;
  baseContent: string;
  brandId: string | null;
  campaignId: string | null;
  createdAt: Date;
  id: string;
  idempotencyKey: string | null;
  isDeleted: boolean;
  media: Prisma.JsonValue;
  organizationId: string;
  ownerId: string;
  postingSetId: string | null;
  publishedAt: Date | null;
  recurrence: Prisma.JsonValue | null;
  rssFeedItemId: string | null;
  rssSourceId: string | null;
  scheduledAt: Date | null;
  status: string;
  statusTransitions: Prisma.JsonValue;
  timezone: string;
  title: string;
  updatedAt: Date;
};

export type SchedulerPostTag = {
  backgroundColor: string;
  id: string;
  isDeleted: boolean;
  label: string;
  textColor: string;
};

export type SchedulerPostTarget = {
  agentContextSource: string | null;
  agentContextVersion: number | null;
  agentStrategyId: string | null;
  agentThreadId: string | null;
  analyticsCollectedAt: Date | null;
  analyticsCollectionAttemptKey: string | null;
  analyticsCollectionError: Prisma.JsonValue | null;
  analyticsCollectionRequestedAt: Date | null;
  analyticsCollectionState: string;
  brandId: string | null;
  campaignId: string | null;
  category?: PostCategory;
  createdAt: Date;
  credentialId: string;
  externalId: string | null;
  externalShortcode: string | null;
  groupId: string | null;
  id: string;
  isDeleted: boolean;
  description?: string;
  label?: string | null;
  lastAttemptAt: Date | null;
  order: number;
  platform: string;
  publishedAt: Date | null;
  publishApprovalId: string | null;
  retryCount: number;
  scheduledDate: Date | null;
  status: string;
  targetAttachments: Prisma.JsonValue;
  targetError: Prisma.JsonValue | null;
  targetExecutionState: string;
  targetIdempotencyKey: string | null;
  targetReadiness: Prisma.JsonValue | null;
  targetSettings: Prisma.JsonValue;
  visibility: PostVisibility | null;
  targetValidationIssues: string[];
  targetValidationState: string;
  tags?: SchedulerPostTag[];
  timezone: string;
  updatedAt: Date;
  url: string | null;
  organizationId?: string;
  userId?: string;
  workflowExecutionId: string | null;
};

export type SchedulerPostAnalytics = {
  brandId: string;
  date: Date;
  engagementRate: number;
  id: string;
  organizationId: string;
  platform: string;
  postId: string;
  totalComments: number;
  totalLikes: number;
  totalSaves: number;
  totalShares: number;
  totalViews: number;
  updatedAt: Date;
};

export type PublishListPublicationState = 'posted' | 'not-posted';

export type ReleaseGroupListSort =
  | 'createdAt: -1'
  | 'createdAt: 1'
  | 'scheduledDate: -1'
  | 'scheduledDate: 1'
  | 'updatedAt: -1'
  | 'updatedAt: 1';

/**
 * Canonical Calendar and Publish-list read-model query. `statuses` narrows the
 * derived release status; the remaining target facets are target-scoped — a
 * release matches when **at least one** of its channel targets satisfies all of
 * them.
 */
export type ReleaseGroupListQuery = {
  brandId?: string;
  campaignId?: string;
  categories?: PostCategory[];
  credentialIds?: string[];
  endDate?: Date;
  executionStates?: TargetExecutionState[];
  limit?: number;
  organizationId: string;
  page?: number;
  platforms?: CredentialPlatform[];
  publicationState?: PublishListPublicationState;
  search?: string;
  sort?: ReleaseGroupListSort;
  sources?: ReleaseTargetSource[];
  startDate?: Date;
  statuses?: ReleaseStatus[];
};

export type ReleaseGroupListResult = {
  docs: IReleaseGroup[];
  hasNextPage: boolean;
  hasPrevPage: boolean;
  limit: number;
  nextPage: number | null;
  page: number;
  pagingCounter: number;
  prevPage: number | null;
  totalDocs: number;
  totalPages: number;
};

export type CreateAttachmentPostsParams = {
  brandId: string;
  group: SchedulerPostGroup;
  input: CreateReleaseGroupInput;
  parent: SchedulerPostTarget;
  target: ChannelTargetInput;
  userId: string;
};

export type CreatePostGroupParams = {
  input: CreateReleaseGroupInput;
  organizationId: string;
  provenance?: PostGroupCreateProvenance;
  scheduledAt: Date | null;
  status: ReleaseStatus;
  userId: string;
};

export type ResolveManualRetryParams = {
  existing: SchedulerPostTarget;
  groupId: string;
  input: UpdateChannelTargetInput;
  organizationId: string;
  targetId: string;
  tx: SchedulerTx;
  userId: string;
};

export type ManualRetryResolution = {
  isManualRetry: boolean;
  manualRetryApproval?: IPublishApproval;
};
