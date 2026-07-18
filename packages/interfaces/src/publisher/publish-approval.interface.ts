import type {
  CredentialPlatform,
  PublishApprovalPolicyId,
  PublishApprovalStatus,
} from '@genfeedai/enums';

export interface IPublishApprovalDestination {
  credentialId: string;
  platform: CredentialPlatform;
}

export type IPublishScheduleIntent =
  | { kind: 'immediate' }
  | { kind: 'scheduled'; scheduledAt: string; timezone: string };

export interface IPublishApprovalPolicy {
  id: PublishApprovalPolicyId.VERSION_BOUND_V1;
  version: 1;
}

export interface IPublishApprovalStatusTransition {
  actorId?: string | null;
  at: string;
  from: PublishApprovalStatus | null;
  reason?: string;
  to: PublishApprovalStatus;
}

/** Auditable authority for one exact canonical Post target and version pin. */
export interface IPublishApproval {
  actorUserId: string;
  artifactVersionPinId: string;
  brandId: string;
  contextVersion?: number | null;
  createdAt: string;
  destinations: IPublishApprovalDestination[];
  executedAt?: string | null;
  id: string;
  invalidatedAt?: string | null;
  invalidationReason?: string | null;
  operationId: string;
  organizationId: string;
  policy: IPublishApprovalPolicy;
  postId: string;
  provenance: Record<string, unknown>;
  scheduleIntent: IPublishScheduleIntent;
  scopeDigest: string;
  status: PublishApprovalStatus;
  statusTransitions: IPublishApprovalStatusTransition[];
  updatedAt: string;
}

export interface ClaimPublishExecutionParams {
  approvalId: string;
  operationId: string;
  organizationId: string;
  postId: string;
  versionPinId: string;
}

export interface CompletePublishExecutionParams {
  approvalId: string;
  error?: string;
  executionStartedAt: string;
  isSuccessful: boolean;
  operationId: string;
  organizationId: string;
  versionPinId: string;
}

export interface CreateCurrentPostPublishApprovalParams<
  TTransaction = unknown,
> {
  actorUserId: string;
  contextVersion?: number;
  mode: 'immediate' | 'scheduled';
  organizationId: string;
  postId: string;
  provenance?: Record<string, unknown>;
  transaction?: TTransaction;
}

export interface CreatePostPublishApprovalParams<TTransaction = unknown> {
  actorUserId: string;
  body: unknown;
  organizationId: string;
  provenance?: Record<string, unknown>;
  transaction?: TTransaction;
}

export interface PublishExecutionClaim {
  approval: IPublishApproval;
  executionStartedAt: string | null;
  isAlreadyPublished: boolean;
}
