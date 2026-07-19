import { randomUUID } from 'node:crypto';
import { canTransitionPublishApprovalStatus } from '@genfeedai/api-types/contracts';
import {
  PublishApprovalPolicyId,
  PublishApprovalStatus,
} from '@genfeedai/enums';
import type {
  ClaimPublishExecutionParams,
  CompletePublishExecutionParams,
  CreateCurrentPostPublishApprovalParams,
  CreatePostPublishApprovalParams,
  IPublishApproval,
  IPublishScheduleIntent,
  PublishExecutionClaim,
} from '@genfeedai/interfaces';
import {
  type Prisma,
  CredentialPlatform as PrismaCredentialPlatform,
} from '@genfeedai/prisma';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AgentArtifactReferenceService } from '@server/agent-artifacts/agent-artifact-reference.service';
import {
  buildApprovalProvenance,
  readApprovalOrigin,
} from '@server/publish-approvals/publish-approval-action-origin';
import {
  type ApprovalPost,
  PublishApprovalContractCodec,
  type PublishApprovalRow,
} from '@server/publish-approvals/publish-approval-contract.codec';
import { digestPublishApprovalValue } from '@server/publish-approvals/publish-approval-integrity';
import type { ServerLogger, ServerPrisma } from '@server/server.dependencies';

export type {
  ClaimPublishExecutionParams,
  CompletePublishExecutionParams,
  CreateCurrentPostPublishApprovalParams,
  CreatePostPublishApprovalParams,
  PublishExecutionClaim,
} from '@genfeedai/interfaces';

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

const ACTIVATABLE_APPROVAL_STATUSES = [
  ...ACTIVE_APPROVAL_STATUSES,
  PublishApprovalStatus.PUBLISHED,
] as const;

const PUBLISH_EXECUTION_LEASE_MS = 15 * 60 * 1000;

type PublishApprovalTransaction = Pick<
  Prisma.TransactionClient,
  'post' | 'publishApproval'
>;

export class PublishApprovalsService {
  private readonly contractCodec = new PublishApprovalContractCodec();

  constructor(
    private readonly prisma: Pick<
      ServerPrisma,
      | '$transaction'
      | 'credential'
      | 'member'
      | 'organization'
      | 'post'
      | 'publishApproval'
    >,
    private readonly artifactReferenceService: AgentArtifactReferenceService,
    private readonly logger?: ServerLogger,
  ) {}

  toPublicInterface(row: unknown): IPublishApproval {
    return this.contractCodec.toInterface(row as PublishApprovalRow);
  }

  async assertPostMutable(
    organizationId: string,
    postId: string,
  ): Promise<void> {
    const executing = (await this.prisma.publishApproval.findFirst({
      where: {
        organizationId,
        postId,
        status: PublishApprovalStatus.EXECUTING,
      },
    })) as PublishApprovalRow | null;
    if (executing) {
      if (
        executing.updatedAt.getTime() + PUBLISH_EXECUTION_LEASE_MS <=
        Date.now()
      ) {
        await this.resetExpiredExecution(executing);
        return;
      }
      throw new ConflictException(
        'Cannot edit approved publish scope while provider execution is in flight.',
      );
    }
  }

  async createForCurrentPost(
    params: CreateCurrentPostPublishApprovalParams<Prisma.TransactionClient>,
  ): Promise<IPublishApproval> {
    const post = await this.getPostOrThrow(
      params.organizationId,
      params.postId,
      params.transaction,
    );
    const scheduleIntent: IPublishScheduleIntent =
      params.mode === 'scheduled'
        ? {
            kind: 'scheduled',
            scheduledAt: this.contractCodec
              .requireScheduledDate(post)
              .toISOString(),
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
      transaction: params.transaction,
    });
  }

  async createForPost(
    params: CreatePostPublishApprovalParams<Prisma.TransactionClient>,
  ): Promise<IPublishApproval> {
    const client = params.transaction ?? this.prisma;
    const input = this.contractCodec.parseCreateInput(params.body);
    const post = await this.getPostOrThrow(
      params.organizationId,
      input.postId,
      client,
    );
    this.contractCodec.assertTargetStatus(post);
    if (
      input.contextVersion !== undefined &&
      input.contextVersion !== post.agentContextVersion
    ) {
      throw new ConflictException('Publish approval context version is stale.');
    }
    this.contractCodec.assertScheduleIntent(post, input.scheduleIntent);

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
        transaction: params.transaction,
      });

    const destinations = this.contractCodec.canonicalDestinations(post);
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
    const scopeDigest = digestPublishApprovalValue(scope);
    const existing = (await client.publishApproval.findFirst({
      where: {
        organizationId: post.organizationId,
        postId: post.id,
        scopeDigest,
      },
    })) as PublishApprovalRow | null;
    if (existing) {
      await this.activatePostApproval(post, existing, client);
      this.recordApprovalTelemetry(
        'approve',
        'success',
        'matched',
        post.organizationId,
      );
      return this.contractCodec.toInterface(existing);
    }

    const id = randomUUID();
    const operationId = digestPublishApprovalValue({
      action: 'publish',
      approvalId: id,
      artifactVersionPinId: versionPin.id,
      destinations,
    });
    const now = new Date();
    const initialTransition = this.contractCodec.transition(
      null,
      PublishApprovalStatus.APPROVED,
      params.actorUserId,
    );

    let approval: PublishApprovalRow;
    try {
      const persistApproval = async (
        tx: PublishApprovalTransaction,
      ): Promise<PublishApprovalRow> => {
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
              this.contractCodec.parseStatus(prior.status) ===
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
              statusTransitions: this.contractCodec.toJson([
                ...this.contractCodec.readTransitions(prior.statusTransitions),
                this.contractCodec.transition(
                  this.contractCodec.parseStatus(prior.status),
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
            destinations: this.contractCodec.toJson(destinations),
            id,
            operationId,
            organizationId: post.organizationId,
            policy: this.contractCodec.toJson(input.policy),
            postId: post.id,
            provenance: this.contractCodec.toJson(
              buildApprovalProvenance(params.provenance, params.actorUserId),
            ),
            scheduleIntent: this.contractCodec.toJson(input.scheduleIntent),
            scopeDigest,
            status: PublishApprovalStatus.APPROVED,
            statusTransitions: this.contractCodec.toJson([initialTransition]),
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
      };
      approval = params.transaction
        ? await persistApproval(params.transaction)
        : await this.prisma.$transaction(persistApproval);
    } catch (error: unknown) {
      if (
        params.transaction ||
        (error as { code?: unknown }).code !== 'P2002'
      ) {
        throw error;
      }
      const concurrentWinner = (await client.publishApproval.findFirst({
        where: {
          organizationId: post.organizationId,
          postId: post.id,
          scopeDigest,
        },
      })) as PublishApprovalRow | null;
      if (!concurrentWinner) {
        throw error;
      }
      await this.activatePostApproval(post, concurrentWinner, client);
      this.recordApprovalTelemetry(
        'approve',
        'success',
        'matched',
        post.organizationId,
      );
      return this.contractCodec.toInterface(concurrentWinner);
    }

    this.recordApprovalTelemetry(
      'approve',
      'success',
      'matched',
      post.organizationId,
    );
    return this.contractCodec.toInterface(approval);
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
    try {
      let approval = await this.getApprovalOrThrow(
        params.organizationId,
        params.approvalId,
        params.postId,
      );
      if (params.operationId !== approval.operationId) {
        throw new ConflictException(
          'Queued publish operation identity is stale.',
        );
      }
      if (params.versionPinId !== approval.artifactVersionPinId) {
        throw new ConflictException(
          'Queued artifact version identity is stale.',
        );
      }
      const initialStatus = this.contractCodec.parseStatus(approval.status);
      if (initialStatus === PublishApprovalStatus.PUBLISHED) {
        this.recordApprovalTelemetry(
          'execute',
          'success',
          'matched',
          params.organizationId,
        );
        return {
          approval: this.contractCodec.toInterface(approval),
          executionStartedAt: null,
          isAlreadyPublished: true,
        };
      }
      if (initialStatus === PublishApprovalStatus.EXECUTING) {
        approval = await this.resetExpiredExecution(approval);
      }

      const post = await this.getPostOrThrow(
        params.organizationId,
        params.postId,
      );
      try {
        this.contractCodec.assertTargetStatus(post);
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

      const executionStartedAt = new Date();
      const claimed = await this.prisma.publishApproval.updateMany({
        data: {
          lastError: null,
          status: PublishApprovalStatus.EXECUTING,
          statusTransitions: this.contractCodec.toJson([
            ...this.contractCodec.readTransitions(approval.statusTransitions),
            this.contractCodec.transition(
              this.contractCodec.parseStatus(approval.status),
              PublishApprovalStatus.EXECUTING,
            ),
          ]),
          updatedAt: executionStartedAt,
        },
        where: {
          id: approval.id,
          organizationId: approval.organizationId,
          status: PublishApprovalStatus.QUEUED,
          updatedAt: approval.updatedAt,
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
      return {
        approval: this.contractCodec.toInterface(updated),
        executionStartedAt: updated.updatedAt.toISOString(),
        isAlreadyPublished: false,
      };
    } catch (error: unknown) {
      this.recordApprovalTelemetry(
        'execute',
        'failure',
        'blocked',
        params.organizationId,
      );
      throw error;
    }
  }

  async completeExecution(
    params: CompletePublishExecutionParams,
  ): Promise<IPublishApproval> {
    const approval = await this.completeClaimedExecution(params);
    this.recordApprovalTelemetry(
      'execute',
      params.isSuccessful ? 'success' : 'failure',
      'matched',
      params.organizationId,
    );
    return approval;
  }

  async invalidatePost(
    organizationId: string,
    postId: string,
    reason: string,
    actorId?: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Read the active approvals inside the transaction so a concurrent
      // claim-to-EXECUTING cannot slip between the eligibility check and the
      // invalidating writes.
      const approvals = (await tx.publishApproval.findMany({
        where: {
          organizationId,
          postId,
          status: { in: [...ACTIVE_APPROVAL_STATUSES] },
        },
      })) as PublishApprovalRow[];
      if (
        approvals.some(
          (approval) =>
            this.contractCodec.parseStatus(approval.status) ===
            PublishApprovalStatus.EXECUTING,
        )
      ) {
        throw new ConflictException(
          'Cannot invalidate a publish approval while provider execution is in flight.',
        );
      }
      for (const approval of approvals) {
        await tx.publishApproval.update({
          data: {
            invalidatedAt: now,
            invalidationReason: reason,
            status: PublishApprovalStatus.INVALIDATED,
            statusTransitions: this.contractCodec.toJson([
              ...this.contractCodec.readTransitions(approval.statusTransitions),
              this.contractCodec.transition(
                this.contractCodec.parseStatus(approval.status),
                PublishApprovalStatus.INVALIDATED,
                actorId,
                reason,
              ),
            ]),
          },
          where: { id: approval.id },
        });
      }
      // Clear every approval marker, not just the pin id: leaving
      // reviewDecision=APPROVED / reviewVersionPinId set lets the worker's
      // legacy-pin fallback enqueue a job without approval identities, which
      // execution then rejects.
      await tx.post.updateMany({
        data: {
          publishApprovalId: null,
          reviewDecision: null,
          reviewVersionPinId: null,
        },
        where: { id: postId, organizationId },
      });
    });
    this.recordApprovalTelemetry(
      'revoke',
      'success',
      'not_applicable',
      organizationId,
    );
  }

  private async completeClaimedExecution(
    params: CompletePublishExecutionParams,
  ): Promise<IPublishApproval> {
    const current = await this.getApprovalOrThrow(
      params.organizationId,
      params.approvalId,
    );
    if (current.operationId !== params.operationId) {
      throw new ConflictException(
        'Publish completion operation identity is stale.',
      );
    }
    if (current.artifactVersionPinId !== params.versionPinId) {
      throw new ConflictException(
        'Publish completion artifact version identity is stale.',
      );
    }

    const from = this.contractCodec.parseStatus(current.status);
    const next = params.isSuccessful
      ? PublishApprovalStatus.PUBLISHED
      : PublishApprovalStatus.FAILED;
    if (from === next) {
      return this.contractCodec.toInterface(current);
    }
    if (from !== PublishApprovalStatus.EXECUTING) {
      throw new ConflictException(
        `Publish approval cannot complete from ${from}.`,
      );
    }

    const executionStartedAt = this.contractCodec.parseExecutionStartedAt(
      params.executionStartedAt,
    );
    if (current.updatedAt.getTime() !== executionStartedAt.getTime()) {
      throw new ConflictException(
        'Publish execution lease is stale or has been reclaimed.',
      );
    }
    if (
      executionStartedAt.getTime() + PUBLISH_EXECUTION_LEASE_MS <=
      Date.now()
    ) {
      throw new ConflictException('Publish execution lease has expired.');
    }

    const failureReason = params.isSuccessful
      ? undefined
      : (params.error ?? 'Provider execution failed.');
    const completed = await this.prisma.publishApproval.updateMany({
      data: {
        ...(params.isSuccessful ? { executedAt: new Date() } : {}),
        lastError: failureReason ?? null,
        status: next,
        statusTransitions: this.contractCodec.toJson([
          ...this.contractCodec.readTransitions(current.statusTransitions),
          this.contractCodec.transition(from, next, undefined, failureReason),
        ]),
      },
      where: {
        artifactVersionPinId: params.versionPinId,
        id: current.id,
        operationId: params.operationId,
        organizationId: params.organizationId,
        status: PublishApprovalStatus.EXECUTING,
        updatedAt: executionStartedAt,
      },
    });
    if (completed.count !== 1) {
      throw new ConflictException(
        'Publish execution lease changed before completion.',
      );
    }

    const updated = await this.getApprovalOrThrow(
      params.organizationId,
      params.approvalId,
    );
    return this.contractCodec.toInterface(updated);
  }

  private async resetExpiredExecution(
    approval: PublishApprovalRow,
  ): Promise<PublishApprovalRow> {
    const expiresAt = approval.updatedAt.getTime() + PUBLISH_EXECUTION_LEASE_MS;
    if (expiresAt > Date.now()) {
      throw new ConflictException(
        'Publish approval is already executing with an active lease.',
      );
    }

    const resetAt = new Date();
    const reason = 'Expired publish execution lease was reset for retry.';
    const reset = await this.prisma.publishApproval.updateMany({
      data: {
        lastError: reason,
        status: PublishApprovalStatus.QUEUED,
        statusTransitions: this.contractCodec.toJson([
          ...this.contractCodec.readTransitions(approval.statusTransitions),
          this.contractCodec.transition(
            PublishApprovalStatus.EXECUTING,
            PublishApprovalStatus.FAILED,
            undefined,
            reason,
          ),
          this.contractCodec.transition(
            PublishApprovalStatus.FAILED,
            PublishApprovalStatus.QUEUED,
            undefined,
            'Retry queued after expired execution lease.',
          ),
        ]),
        updatedAt: resetAt,
      },
      where: {
        id: approval.id,
        organizationId: approval.organizationId,
        status: PublishApprovalStatus.EXECUTING,
        updatedAt: approval.updatedAt,
      },
    });
    if (reset.count !== 1) {
      throw new ConflictException(
        'Publish execution lease changed before it could be reset.',
      );
    }
    return this.getApprovalOrThrow(
      approval.organizationId,
      approval.id,
      approval.postId,
    );
  }

  private recordApprovalTelemetry(
    action: 'approve' | 'execute' | 'reject' | 'revoke',
    outcome: 'failure' | 'success',
    integrity: 'blocked' | 'matched' | 'not_applicable',
    organizationId: string,
  ): void {
    this.logger?.log('conversation_shell_approval', {
      action,
      integrity,
      organizationId,
      origin: readApprovalOrigin(),
      outcome,
      telemetryQueryVersion: 1,
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
    const from = this.contractCodec.parseStatus(current.status);
    if (from === next) {
      return this.contractCodec.toInterface(current);
    }
    if (!canTransitionPublishApprovalStatus(from, next)) {
      throw new ConflictException(
        `Publish approval cannot transition from ${from} to ${next}.`,
      );
    }
    // Guard the write with the status that authorized it so a concurrent
    // transition on the same row fails loudly instead of being silently
    // overwritten (mirrors the QUEUED-predicate claim guard above).
    const transitioned = await this.prisma.publishApproval.updateMany({
      data: {
        ...(next === PublishApprovalStatus.PUBLISHED
          ? { executedAt: new Date() }
          : {}),
        ...(reason ? { lastError: reason } : {}),
        status: next,
        statusTransitions: this.contractCodec.toJson([
          ...this.contractCodec.readTransitions(current.statusTransitions),
          this.contractCodec.transition(from, next, actorId, reason),
        ]),
      },
      where: { id: current.id, organizationId, status: from },
    });
    if (transitioned.count !== 1) {
      throw new ConflictException(
        `Publish approval changed concurrently; expected status ${from}.`,
      );
    }
    const updated = await this.getApprovalOrThrow(organizationId, approvalId);
    return this.contractCodec.toInterface(updated);
  }

  private async assertApprovalScope(
    approval: PublishApprovalRow,
    post: ApprovalPost,
  ): Promise<void> {
    const destinations = this.contractCodec.readDestinations(
      approval.destinations,
    );
    const intent = this.contractCodec.readScheduleIntent(
      approval.scheduleIntent,
    );
    const policy = this.contractCodec.readPolicy(approval.policy);
    const expectedScope = {
      actorUserId: approval.actorUserId,
      artifactVersionPinId: approval.artifactVersionPinId,
      brandId: post.brandId,
      contextVersion: approval.contextVersion,
      destinations: this.contractCodec.canonicalDestinations(post),
      organizationId: post.organizationId,
      policy,
      postId: post.id,
      scheduleIntent: intent,
    };
    try {
      this.contractCodec.assertScheduleIntent(post, intent);
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
      approval.scopeDigest !== digestPublishApprovalValue(expectedScope)
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

    const credentialPlatform = Object.values(PrismaCredentialPlatform).find(
      (platform) => platform === String(destinations[0]?.platform),
    );
    const credential = await this.prisma.credential.findFirst({
      select: { id: true },
      where: {
        brandId: post.brandId,
        id: post.credentialId,
        isConnected: true,
        isDeleted: false,
        organizationId: post.organizationId,
        platform: credentialPlatform,
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
    client: PublishApprovalTransaction = this.prisma,
  ): Promise<void> {
    const activated = await client.post.updateMany({
      data: {
        publishApprovalId: approval.id,
        reviewDecision: 'APPROVED',
        reviewVersionPinId: approval.artifactVersionPinId,
      },
      where: {
        id: post.id,
        isDeleted: false,
        organizationId: post.organizationId,
        publishApprovals: {
          some: {
            id: approval.id,
            organizationId: approval.organizationId,
            status: { in: [...ACTIVATABLE_APPROVAL_STATUSES] },
          },
        },
      },
    });
    if (activated.count !== 1) {
      throw new ConflictException(
        'The matching approval is no longer eligible for activation.',
      );
    }
  }

  private async getPostOrThrow(
    organizationId: string,
    postId: string,
    client: Pick<Prisma.TransactionClient, 'post'> = this.prisma,
  ): Promise<ApprovalPost> {
    const post = (await client.post.findFirst({
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
}
