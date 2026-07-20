import type {
  ChannelTargetInput,
  CreateReleaseGroupInput,
  UpdateChannelTargetInput,
} from '@api-types/contracts/scheduler.contract';
import type { ReleaseStatus } from '@genfeedai/enums';
import type {
  IPublishApproval,
  PostGroupCreateProvenance,
} from '@genfeedai/interfaces';
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
  createdAt: Date;
  id: string;
  idempotencyKey: string | null;
  isDeleted: boolean;
  media: Prisma.JsonValue;
  organizationId: string;
  ownerId: string;
  publishedAt: Date | null;
  recurrence: Prisma.JsonValue | null;
  scheduledAt: Date | null;
  status: string;
  statusTransitions: Prisma.JsonValue;
  timezone: string;
  title: string;
  updatedAt: Date;
};

export type SchedulerPostTarget = {
  agentContextSource: string | null;
  agentContextVersion: number | null;
  agentRunId: string | null;
  agentStrategyId: string | null;
  agentThreadId: string | null;
  brandId: string | null;
  createdAt: Date;
  credentialId: string;
  externalId: string | null;
  externalShortcode: string | null;
  groupId: string | null;
  id: string;
  isDeleted: boolean;
  lastAttemptAt: Date | null;
  order: number;
  platform: string;
  publishedAt: Date | null;
  publishApprovalId: string | null;
  retryCount: number;
  scheduledDate: Date | null;
  targetAttachments: Prisma.JsonValue;
  targetError: Prisma.JsonValue | null;
  targetExecutionState: string;
  targetIdempotencyKey: string | null;
  targetReadiness: Prisma.JsonValue | null;
  targetSettings: Prisma.JsonValue;
  targetValidationIssues: string[];
  targetValidationState: string;
  timezone: string;
  updatedAt: Date;
  url: string | null;
  workflowExecutionId: string | null;
};

export type ReleaseGroupListQuery = {
  brandId?: string;
  endDate: Date;
  organizationId: string;
  startDate: Date;
  statuses?: ReleaseStatus[];
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
