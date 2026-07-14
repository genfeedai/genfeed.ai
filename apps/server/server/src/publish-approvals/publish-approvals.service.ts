import { createHash, randomUUID } from 'node:crypto';
import {
  type CreatePublishApprovalInput,
  canTransitionPublishApprovalStatus,
  createPublishApprovalSchema,
  publishApprovalDestinationSchema,
  publishApprovalPolicySchema,
  publishApprovalStatusSchema,
  publishScheduleIntentSchema,
} from '@genfeedai/api-types/contracts';
import {
  CredentialPlatform,
  PostStatus,
  PublishApprovalPolicyId,
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
import {
  Prisma,
  type CredentialPlatform as PrismaCredentialPlatform,
} from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AgentArtifactReferenceService } from '@server/agent-artifacts/agent-artifact-reference.service';
import { SERVER_TOKENS, type ServerPrisma } from '@server/server.dependencies';

class PublishApprovalNotFoundException extends HttpException {
  constructor(resource: string, identifier: string) {
    const detail = `${resource} with identifier '${identifier}' not found`;
    super(
      {
        detail,
        source: { parameter: identifier },
        title: 'Resource Not Found',
      },
      HttpStatus.NOT_FOUND,
    );
    this.message = detail;
  }
}

const ACTIVE_APPROVAL_STATUSES = [
  PublishApprovalStatus.APPROVED,
  PublishApprovalStatus.QUEUED,
  PublishApprovalStatus.EXECUTING,
  PublishApprovalStatus.FAILED,
] as const;

type PublishApprovalRow = {
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

type ApprovalPost = {
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

export interface CreatePostPublishApprovalParams {
  actorUserId: string;
  body: unknown;
  organizationId: string;
  provenance?: Record<string, unknown>;
}

export interface ClaimPublishExecutionParams {
  approvalId: string;
  operationId?: string;
  organizationId: string;
  postId: string;
  versionPinId?: string;
}

export interface CreateCurrentPostPublishApprovalParams {
  actorUserId: string;
  contextVersion?: number;
  mode: 'immediate' | 'scheduled';
  organizationId: string;
  postId: string;
  provenance?: Record<string, unknown>;
}

export interface PublishExecutionClaim {
  alreadyPublished: boolean;
  approval: IPublishApproval;
}

@Injectable()
export class PublishApprovalsService {
  constructor(
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: ServerPrisma,
    private readonly artifactReferenceService: AgentArtifactReferenceService,
  ) {}

  toPublicInterface(row: unknown): IPublishApproval {
    return this.toInterface(row as PublishApprovalRow);
  }

  async assertPostMutable(
    organizationId: string,
    postId: string,
  ): Promise<void> {
    const executing = await this.prisma.publishApproval.findFirst({
      select: { id: true },
      where: {
        organizationId,
        postId,
        status: PublishApprovalStatus.EXECUTING,
      },
    });
    if (executing) {
      throw new ConflictException(
        'Cannot edit approved publish scope while provider execution is in flight.',
      );
    }
  }

  async createForCurrentPost(
    params: CreateCurrentPostPublishApprovalParams,
  ): Promise<IPublishApproval> {
    const post = await this.getPostOrThrow(
      params.organizationId,
      params.postId,
    );
    const scheduleIntent: IPublishScheduleIntent =
      params.mode === 'scheduled'
        ? {
            kind: 'scheduled',
            scheduledAt: this.requireScheduledDate(post).toISOString(),
            timezone: post.timezone,
          }
        : { kind: 'immediate' };
    return this.createForPost({
      actorUserId: params.actorUserId,
      body: {
        ...(params.contextVersion !== undefined
          ? { contextVersion: params.contextVersion }
          : {}),
        policy: {
          id: PublishApprovalPolicyId.VERSION_BOUND_V1,
          version: 1,
        },
        postId: params.postId,
        scheduleIntent,
      },
      organizationId: params.organizationId,
      provenance: params.provenance,
    });
  }

  async createForPost(
    params: CreatePostPublishApprovalParams,
  ): Promise<IPublishApproval> {
    const input = this.parseCreateInput(params.body);
    const post = await this.getPostOrThrow(params.organizationId, input.postId);
    this.assertTargetStatus(post);
    if (
      input.contextVersion !== undefined &&
      post.agentContextVersion !== null &&
      input.contextVersion !== post.agentContextVersion
    ) {
      throw new ConflictException('Publish approval context version is stale.');
    }
    this.assertScheduleIntent(post, input.scheduleIntent);

    const versionPin =
      await this.artifactReferenceService.createOrReuseVersionPin({
        createdByUserId: params.actorUserId,
        reference: {
          brandId: post.brandId,
          kind: 'post',
          organizationId: post.organizationId,
          recordId: post.id,
          serializer: 'post',
        },
      });

    const destinations = this.canonicalDestinations(post);
    const scope = {
      actorUserId: params.actorUserId,
      artifactVersionPinId: versionPin.id,
      brandId: post.brandId,
      contextVersion: input.contextVersion ?? post.agentContextVersion,
      destinations,
      organizationId: post.organizationId,
      policy: input.policy,
      postId: post.id,
      scheduleIntent: input.scheduleIntent,
    };
    const scopeDigest = this.digest(scope);
    const existing = (await this.prisma.publishApproval.findFirst({
      where: {
        organizationId: post.organizationId,
        postId: post.id,
        scopeDigest,
      },
    })) as PublishApprovalRow | null;
    if (existing) {
      await this.activatePostApproval(post, existing);
      return this.toInterface(existing);
    }

    const id = randomUUID();
    const operationId = this.digest({
      action: 'publish',
      approvalId: id,
      artifactVersionPinId: versionPin.id,
      destinations,
    });
    const now = new Date();
    const initialTransition = this.transition(
      null,
      PublishApprovalStatus.APPROVED,
      params.actorUserId,
    );

    let approval: PublishApprovalRow;
    try {
      approval = await this.prisma.$transaction(async (tx) => {
        const active = (await tx.publishApproval.findMany({
          where: {
            organizationId: post.organizationId,
            postId: post.id,
            status: { in: [...ACTIVE_APPROVAL_STATUSES] },
          },
        })) as PublishApprovalRow[];
        if (
          active.some(
            (prior) =>
              this.parseStatus(prior.status) ===
              PublishApprovalStatus.EXECUTING,
          )
        ) {
          throw new ConflictException(
            'Cannot replace a publish approval while provider execution is in flight.',
          );
        }
        for (const prior of active) {
          await tx.publishApproval.update({
            data: {
              invalidatedAt: now,
              invalidationReason: 'A different publish scope was approved.',
              status: PublishApprovalStatus.INVALIDATED,
              statusTransitions: this.toJson([
                ...this.readTransitions(prior.statusTransitions),
                this.transition(
                  this.parseStatus(prior.status),
                  PublishApprovalStatus.INVALIDATED,
                  params.actorUserId,
                  'A different publish scope was approved.',
                ),
              ]),
            },
            where: { id: prior.id },
          });
        }

        const created = (await tx.publishApproval.create({
          data: {
            actorUserId: params.actorUserId,
            artifactVersionPinId: versionPin.id,
            brandId: post.brandId,
            contextVersion: scope.contextVersion ?? null,
            destinations: this.toJson(destinations),
            id,
            operationId,
            organizationId: post.organizationId,
            policy: this.toJson(input.policy),
            postId: post.id,
            provenance: this.toJson({
              contractVersion: 1,
              source: 'typed-publish-approval',
              ...(params.provenance ?? {}),
            }),
            scheduleIntent: this.toJson(input.scheduleIntent),
            scopeDigest,
            status: PublishApprovalStatus.APPROVED,
            statusTransitions: this.toJson([initialTransition]),
          },
        })) as PublishApprovalRow;

        await tx.post.update({
          data: {
            publishApprovalId: created.id,
            reviewDecision: 'APPROVED',
            reviewVersionPinId: versionPin.id,
            reviewedAt: now,
          },
          where: { id: post.id },
        });
        return created;
      });
    } catch (error: unknown) {
      if ((error as { code?: unknown }).code !== 'P2002') {
        throw error;
      }
      const concurrentWinner = (await this.prisma.publishApproval.findFirst({
        where: {
          organizationId: post.organizationId,
          postId: post.id,
          scopeDigest,
        },
      })) as PublishApprovalRow | null;
      if (!concurrentWinner) {
        throw error;
      }
      await this.activatePostApproval(post, concurrentWinner);
      return this.toInterface(concurrentWinner);
    }

    return this.toInterface(approval);
  }

  async markQueued(
    approvalId: string,
    organizationId: string,
    actorId?: string,
  ): Promise<IPublishApproval> {
    return this.transitionStatus(
      approvalId,
      organizationId,
      PublishApprovalStatus.QUEUED,
      actorId,
    );
  }

  async claimForExecution(
    params: ClaimPublishExecutionParams,
  ): Promise<PublishExecutionClaim> {
    const approval = await this.getApprovalOrThrow(
      params.organizationId,
      params.approvalId,
      params.postId,
    );
    if (params.operationId && params.operationId !== approval.operationId) {
      throw new ConflictException(
        'Queued publish operation identity is stale.',
      );
    }
    if (
      params.versionPinId &&
      params.versionPinId !== approval.artifactVersionPinId
    ) {
      throw new ConflictException('Queued artifact version identity is stale.');
    }
    if (this.parseStatus(approval.status) === PublishApprovalStatus.PUBLISHED) {
      return { alreadyPublished: true, approval: this.toInterface(approval) };
    }

    const post = await this.getPostOrThrow(
      params.organizationId,
      params.postId,
    );
    try {
      this.assertTargetStatus(post);
    } catch (error: unknown) {
      await this.invalidatePost(
        approval.organizationId,
        approval.postId,
        'The canonical publish target entered an ineligible execution state.',
      );
      throw error;
    }
    await this.assertCurrentAuthorization(approval);
    await this.assertApprovalScope(approval, post);
    try {
      await this.artifactReferenceService.assertVersionPinCurrent({
        pinId: approval.artifactVersionPinId,
        readContext: {
          brandId: approval.brandId,
          organizationId: approval.organizationId,
        },
      });
    } catch (error: unknown) {
      await this.invalidatePost(
        approval.organizationId,
        approval.postId,
        'The approved immutable artifact version is no longer current.',
      );
      throw error;
    }

    const claimed = await this.prisma.publishApproval.updateMany({
      data: {
        status: PublishApprovalStatus.EXECUTING,
        statusTransitions: this.toJson([
          ...this.readTransitions(approval.statusTransitions),
          this.transition(
            this.parseStatus(approval.status),
            PublishApprovalStatus.EXECUTING,
          ),
        ]),
      },
      where: {
        id: approval.id,
        organizationId: approval.organizationId,
        status: PublishApprovalStatus.QUEUED,
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException(
        'Publish approval is not queued or is already executing.',
      );
    }

    const updated = await this.getApprovalOrThrow(
      params.organizationId,
      params.approvalId,
      params.postId,
    );
    return { alreadyPublished: false, approval: this.toInterface(updated) };
  }

  async completeExecution(
    approvalId: string,
    organizationId: string,
    success: boolean,
    error?: string,
  ): Promise<IPublishApproval> {
    return this.transitionStatus(
      approvalId,
      organizationId,
      success ? PublishApprovalStatus.PUBLISHED : PublishApprovalStatus.FAILED,
      undefined,
      error,
    );
  }

  async invalidatePost(
    organizationId: string,
    postId: string,
    reason: string,
    actorId?: string,
  ): Promise<void> {
    const approvals = (await this.prisma.publishApproval.findMany({
      where: {
        organizationId,
        postId,
        status: { in: [...ACTIVE_APPROVAL_STATUSES] },
      },
    })) as PublishApprovalRow[];
    if (
      approvals.some(
        (approval) =>
          this.parseStatus(approval.status) === PublishApprovalStatus.EXECUTING,
      )
    ) {
      throw new ConflictException(
        'Cannot invalidate a publish approval while provider execution is in flight.',
      );
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const approval of approvals) {
        await tx.publishApproval.update({
          data: {
            invalidatedAt: now,
            invalidationReason: reason,
            status: PublishApprovalStatus.INVALIDATED,
            statusTransitions: this.toJson([
              ...this.readTransitions(approval.statusTransitions),
              this.transition(
                this.parseStatus(approval.status),
                PublishApprovalStatus.INVALIDATED,
                actorId,
                reason,
              ),
            ]),
          },
          where: { id: approval.id },
        });
      }
      await tx.post.updateMany({
        data: { publishApprovalId: null },
        where: { id: postId, organizationId },
      });
    });
  }

  private async transitionStatus(
    approvalId: string,
    organizationId: string,
    next: PublishApprovalStatus,
    actorId?: string,
    reason?: string,
  ): Promise<IPublishApproval> {
    const current = await this.getApprovalOrThrow(organizationId, approvalId);
    const from = this.parseStatus(current.status);
    if (from === next) {
      return this.toInterface(current);
    }
    if (!canTransitionPublishApprovalStatus(from, next)) {
      throw new ConflictException(
        `Publish approval cannot transition from ${from} to ${next}.`,
      );
    }
    const updated = (await this.prisma.publishApproval.update({
      data: {
        ...(next === PublishApprovalStatus.PUBLISHED
          ? { executedAt: new Date() }
          : {}),
        ...(reason ? { lastError: reason } : {}),
        status: next,
        statusTransitions: this.toJson([
          ...this.readTransitions(current.statusTransitions),
          this.transition(from, next, actorId, reason),
        ]),
      },
      where: { id: current.id },
    })) as PublishApprovalRow;
    return this.toInterface(updated);
  }

  private async assertApprovalScope(
    approval: PublishApprovalRow,
    post: ApprovalPost,
  ): Promise<void> {
    const destinations = this.readDestinations(approval.destinations);
    const intent = this.readScheduleIntent(approval.scheduleIntent);
    const policy = this.readPolicy(approval.policy);
    const expectedScope = {
      actorUserId: approval.actorUserId,
      artifactVersionPinId: approval.artifactVersionPinId,
      brandId: post.brandId,
      contextVersion: approval.contextVersion,
      destinations: this.canonicalDestinations(post),
      organizationId: post.organizationId,
      policy,
      postId: post.id,
      scheduleIntent: intent,
    };
    try {
      this.assertScheduleIntent(post, intent);
    } catch (error: unknown) {
      await this.invalidatePost(
        approval.organizationId,
        approval.postId,
        'The protected publish schedule intent changed.',
      );
      throw error;
    }
    if (
      approval.organizationId !== post.organizationId ||
      approval.brandId !== post.brandId ||
      approval.contextVersion !== post.agentContextVersion ||
      post.publishApprovalId !== approval.id ||
      destinations[0]?.credentialId !== post.credentialId ||
      approval.scopeDigest !== this.digest(expectedScope)
    ) {
      await this.invalidatePost(
        approval.organizationId,
        approval.postId,
        'Artifact, organization, brand, destination, schedule, actor, context, or policy changed.',
      );
      throw new ConflictException(
        'Publish approval scope no longer matches the canonical Post.',
      );
    }

    const credential = await this.prisma.credential.findFirst({
      select: { id: true },
      where: {
        brandId: post.brandId,
        id: post.credentialId,
        isConnected: true,
        isDeleted: false,
        organizationId: post.organizationId,
        platform: destinations[0]?.platform as
          | PrismaCredentialPlatform
          | undefined,
      },
    });
    if (!credential) {
      await this.invalidatePost(
        approval.organizationId,
        approval.postId,
        'The approved destination credential is no longer authorized.',
      );
      throw new ForbiddenException(
        'Approved publish destination is no longer authorized.',
      );
    }
  }

  private async assertCurrentAuthorization(
    approval: PublishApprovalRow,
  ): Promise<void> {
    const [member, organization] = await Promise.all([
      this.prisma.member.findFirst({
        select: { id: true },
        where: {
          isActive: true,
          isDeleted: false,
          organizationId: approval.organizationId,
          userId: approval.actorUserId,
        },
      }),
      this.prisma.organization.findFirst({
        select: { userId: true },
        where: { id: approval.organizationId, isDeleted: false },
      }),
    ]);
    if (!member && organization?.userId !== approval.actorUserId) {
      await this.invalidatePost(
        approval.organizationId,
        approval.postId,
        'The approving actor is no longer authorized for the organization.',
      );
      throw new ForbiddenException(
        'Publish approver is no longer authorized for the organization.',
      );
    }
  }

  private async activatePostApproval(
    post: ApprovalPost,
    approval: PublishApprovalRow,
  ): Promise<void> {
    const status = this.parseStatus(approval.status);
    if (
      status === PublishApprovalStatus.INVALIDATED ||
      status === PublishApprovalStatus.CANCELLED
    ) {
      throw new ConflictException(
        'The matching approval was revoked; create a new version before approval.',
      );
    }
    await this.prisma.post.update({
      data: {
        publishApprovalId: approval.id,
        reviewDecision: 'APPROVED',
        reviewVersionPinId: approval.artifactVersionPinId,
      },
      where: { id: post.id },
    });
  }

  private async getPostOrThrow(
    organizationId: string,
    postId: string,
  ): Promise<ApprovalPost> {
    const post = (await this.prisma.post.findFirst({
      select: {
        agentContextVersion: true,
        brandId: true,
        credentialId: true,
        id: true,
        isDeleted: true,
        organizationId: true,
        platform: true,
        publishApprovalId: true,
        scheduledDate: true,
        status: true,
        targetExecutionState: true,
        timezone: true,
      },
      where: { id: postId, isDeleted: false, organizationId },
    })) as ApprovalPost | null;
    if (!post) {
      throw new PublishApprovalNotFoundException('Post', postId);
    }
    return post;
  }

  private async getApprovalOrThrow(
    organizationId: string,
    approvalId: string,
    postId?: string,
  ): Promise<PublishApprovalRow> {
    const approval = (await this.prisma.publishApproval.findFirst({
      where: {
        id: approvalId,
        organizationId,
        ...(postId ? { postId } : {}),
      },
    })) as PublishApprovalRow | null;
    if (!approval) {
      throw new PublishApprovalNotFoundException('PublishApproval', approvalId);
    }
    return approval;
  }

  private parseCreateInput(body: unknown): CreatePublishApprovalInput {
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

  private assertScheduleIntent(
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

  private requireScheduledDate(post: ApprovalPost): Date {
    if (!post.scheduledDate) {
      throw new ConflictException(
        'Scheduled publish approval requires a canonical scheduled date.',
      );
    }
    return post.scheduledDate;
  }

  private canonicalDestinations(
    post: ApprovalPost,
  ): IPublishApprovalDestination[] {
    const platform = Object.values(CredentialPlatform).find(
      (value) => value === post.platform.toLowerCase(),
    );
    if (!platform) {
      throw new ConflictException('Post has an unsupported publish platform.');
    }
    return [{ credentialId: post.credentialId, platform }];
  }

  private assertTargetStatus(post: ApprovalPost): void {
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

  private parseStatus(value: string): PublishApprovalStatus {
    const result = publishApprovalStatusSchema.safeParse(value);
    if (!result.success) {
      throw new ConflictException(
        'Publish approval contains an unknown lifecycle status.',
      );
    }
    return result.data;
  }

  private readDestinations(
    value: Prisma.JsonValue,
  ): IPublishApprovalDestination[] {
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

  private readScheduleIntent(value: Prisma.JsonValue): IPublishScheduleIntent {
    const result = publishScheduleIntentSchema.safeParse(value);
    if (!result.success) {
      throw new ConflictException(
        'Publish approval schedule intent is invalid.',
      );
    }
    return result.data;
  }

  private readPolicy(value: Prisma.JsonValue): IPublishApprovalPolicy {
    const result = publishApprovalPolicySchema.safeParse(value);
    if (!result.success) {
      throw new ConflictException('Publish approval policy is invalid.');
    }
    return result.data;
  }

  private readTransitions(
    value: Prisma.JsonValue,
  ): IPublishApprovalStatusTransition[] {
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

  private transition(
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

  private digest(value: unknown): string {
    return `sha256:v1:${createHash('sha256')
      .update(this.stableStringify(value))
      .digest('hex')}`;
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${this.stableStringify(record[key])}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
  }

  private toInterface(row: PublishApprovalRow): IPublishApproval {
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
      provenance: this.asRecord(row.provenance),
      scheduleIntent: this.readScheduleIntent(row.scheduleIntent),
      scopeDigest: row.scopeDigest,
      status: this.parseStatus(row.status),
      statusTransitions: this.readTransitions(row.statusTransitions),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private asRecord(value: Prisma.JsonValue): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
