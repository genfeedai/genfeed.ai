import {
  type CreatePublishApprovalInput,
  createPublishApprovalSchema,
  publishApprovalDestinationSchema,
  publishApprovalPolicySchema,
  publishApprovalStatusSchema,
  publishScheduleIntentSchema,
} from '@genfeedai/api-types/contracts';
import {
  CredentialPlatform,
  PostStatus,
  PublishApprovalStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type {
  IPublishApproval,
  IPublishApprovalDestination,
  IPublishApprovalPolicy,
  IPublishApprovalStatusTransition,
  IPublishScheduleIntent,
} from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { restoreApprovalProvenance } from '@server/publish-approvals/publish-approval-action-origin';

export type PublishApprovalRow = {
  actorUserId: string;
  artifactVersionPinId: string;
  brandId: string;
  contextVersion: number | null;
  createdAt: Date;
  destinations: Prisma.JsonValue;
  executedAt: Date | null;
  id: string;
  invalidatedAt: Date | null;
  invalidationReason: string | null;
  lastError: string | null;
  operationId: string;
  organizationId: string;
  policy: Prisma.JsonValue;
  postId: string;
  provenance: Prisma.JsonValue;
  scheduleIntent: Prisma.JsonValue;
  scopeDigest: string;
  status: string;
  statusTransitions: Prisma.JsonValue;
  updatedAt: Date;
};

export type ApprovalPost = {
  agentContextVersion: number | null;
  brandId: string;
  credentialId: string;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  platform: string;
  publishApprovalId: string | null;
  scheduledDate: Date | null;
  status: string;
  targetExecutionState: string;
  timezone: string;
};

export class PublishApprovalContractCodec {
  parseCreateInput(body: unknown): CreatePublishApprovalInput {
    const result = createPublishApprovalSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException({
        detail: result.error.issues
          .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
          .join('; '),
        title: 'Invalid publish approval payload',
      });
    }
    return result.data;
  }

  parseStatus(value: string): PublishApprovalStatus {
    const result = publishApprovalStatusSchema.safeParse(value);
    if (!result.success) {
      throw new ConflictException(
        'Publish approval contains an unknown lifecycle status.',
      );
    }
    return result.data;
  }

  parseExecutionStartedAt(value: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
      throw new ConflictException(
        'Publish execution lease timestamp is invalid.',
      );
    }
    return parsed;
  }

  assertScheduleIntent(
    post: ApprovalPost,
    intent: IPublishScheduleIntent,
  ): void {
    if (intent.kind === 'immediate') {
      return;
    }
    if (
      !post.scheduledDate ||
      post.scheduledDate.toISOString() !== intent.scheduledAt ||
      post.timezone !== intent.timezone
    ) {
      throw new ConflictException(
        'Publish schedule intent does not match the canonical Post.',
      );
    }
  }

  requireScheduledDate(post: ApprovalPost): Date {
    if (!post.scheduledDate) {
      throw new ConflictException(
        'Scheduled publish approval requires a canonical scheduled date.',
      );
    }
    return post.scheduledDate;
  }

  canonicalDestinations(post: ApprovalPost): IPublishApprovalDestination[] {
    const platform = Object.values(CredentialPlatform).find(
      (value) => value === post.platform.toLowerCase(),
    );
    if (!platform) {
      throw new ConflictException('Post has an unsupported publish platform.');
    }
    return [{ credentialId: post.credentialId, platform }];
  }

  assertTargetStatus(post: ApprovalPost): void {
    const postStatus = post.status.toLowerCase();
    if (postStatus === PostStatus.PUBLIC || postStatus === PostStatus.PENDING) {
      throw new ConflictException(
        `Post cannot be approved from ${postStatus}.`,
      );
    }
    const status = Object.values(TargetExecutionState).find(
      (value) => value === post.targetExecutionState,
    );
    if (!status) {
      throw new ConflictException(
        'Post target contains an unknown execution status.',
      );
    }
    if (
      status === TargetExecutionState.PUBLISHED ||
      status === TargetExecutionState.CANCELLED ||
      status === TargetExecutionState.SKIPPED
    ) {
      throw new ConflictException(
        `Post target cannot be approved from ${status}.`,
      );
    }
  }

  readDestinations(value: Prisma.JsonValue): IPublishApprovalDestination[] {
    const result = publishApprovalDestinationSchema.array().safeParse(value);
    if (!result.success || result.data.length === 0) {
      throw new ConflictException('Publish approval destinations are invalid.');
    }
    return [...result.data].sort((left, right) =>
      `${left.platform}:${left.credentialId}`.localeCompare(
        `${right.platform}:${right.credentialId}`,
      ),
    );
  }

  readScheduleIntent(value: Prisma.JsonValue): IPublishScheduleIntent {
    const result = publishScheduleIntentSchema.safeParse(value);
    if (!result.success) {
      throw new ConflictException(
        'Publish approval schedule intent is invalid.',
      );
    }
    return result.data;
  }

  readPolicy(value: Prisma.JsonValue): IPublishApprovalPolicy {
    const result = publishApprovalPolicySchema.safeParse(value);
    if (!result.success) {
      throw new ConflictException('Publish approval policy is invalid.');
    }
    return result.data;
  }

  readTransitions(value: Prisma.JsonValue): IPublishApprovalStatusTransition[] {
    if (!Array.isArray(value)) {
      throw new ConflictException(
        'Publish approval transition history is invalid.',
      );
    }
    return value.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new ConflictException(
          'Publish approval transition history is invalid.',
        );
      }
      const record = entry as Record<string, unknown>;
      const to = this.parseStatus(String(record.to));
      const from =
        record.from === null ? null : this.parseStatus(String(record.from));
      if (typeof record.at !== 'string') {
        throw new ConflictException(
          'Publish approval transition history is invalid.',
        );
      }
      return {
        ...(typeof record.actorId === 'string'
          ? { actorId: record.actorId }
          : {}),
        at: record.at,
        from,
        ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
        to,
      };
    });
  }

  transition(
    from: PublishApprovalStatus | null,
    to: PublishApprovalStatus,
    actorId?: string,
    reason?: string,
  ): IPublishApprovalStatusTransition {
    return {
      ...(actorId ? { actorId } : {}),
      at: new Date().toISOString(),
      from,
      ...(reason ? { reason } : {}),
      to,
    };
  }

  toInterface(row: PublishApprovalRow): IPublishApproval {
    return {
      actorUserId: row.actorUserId,
      artifactVersionPinId: row.artifactVersionPinId,
      brandId: row.brandId,
      contextVersion: row.contextVersion,
      createdAt: row.createdAt.toISOString(),
      destinations: this.readDestinations(row.destinations),
      executedAt: row.executedAt?.toISOString() ?? null,
      id: row.id,
      invalidatedAt: row.invalidatedAt?.toISOString() ?? null,
      invalidationReason: row.invalidationReason,
      operationId: row.operationId,
      organizationId: row.organizationId,
      policy: this.readPolicy(row.policy),
      postId: row.postId,
      provenance: restoreApprovalProvenance(
        this.asRecord(row.provenance),
        row.actorUserId,
      ),
      scheduleIntent: this.readScheduleIntent(row.scheduleIntent),
      scopeDigest: row.scopeDigest,
      status: this.parseStatus(row.status),
      statusTransitions: this.readTransitions(row.statusTransitions),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private asRecord(value: Prisma.JsonValue): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
