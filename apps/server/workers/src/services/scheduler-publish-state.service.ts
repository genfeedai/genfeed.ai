import {
  invalidateLearningDependencySource,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { loadLearningPublicationAssociationV1 } from '@api/collections/content-learning/services/learning-publication-source.helper';
import {
  type LearningPublicationPostRow,
  learningPublicationPostSelect,
} from '@api/collections/content-learning/services/learning-publication-source.types';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { CONTENT_LEARNING_ACTION_IDS } from '@api/collections/workflows/templates/content-learning-workflows.template';
import { PostLifecycleService } from '@api/index';
import {
  fromPrismaCredentialPlatform,
  PostVisibility,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { deriveReleaseStatusProjectionFromTargets } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type { IChannelTargetError } from '@genfeedai/contracts/interfaces';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import type { Post, Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { ConflictException } from '@nestjs/common';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

export type SchedulerPublishTargetUpdate = {
  error?: IChannelTargetError | null;
  executionState: TargetExecutionState;
  externalId?: string | null;
  externalShortcode?: string | null;
  lastAttemptAt?: Date;
  publicationDate?: Date;
  publishedAt?: Date;
  retryCount?: number;
  url?: string | null;
  visibility?: PostVisibility;
  workflowExecutionId?: string;
};

export type SchedulerPublishTransitionGuard = {
  expectedExternalId?: string;
  expectedWorkflowExecutionId?: string;
  priorExecutionStates?: readonly TargetExecutionState[];
};

export type SchedulerPublishFinalizationInput = {
  result: Prisma.InputJsonValue;
  source: string;
};

export type SchedulerPublishPostIdentity = {
  groupId?: unknown;
  id: unknown;
  organizationId: unknown;
};

type SchedulerPublishStateInput = {
  finalization?: SchedulerPublishFinalizationInput;
  groupId?: string;
  guard?: SchedulerPublishTransitionGuard;
  organizationId: string;
  postId: string;
  reason?: string;
  update: SchedulerPublishTargetUpdate;
};

type SchedulerPublicationSourceRow = LearningPublicationPostRow &
  Pick<Post, 'workflowExecutionId'>;

type SchedulerGroupRow = {
  id: string;
  publishedAt: Date | null;
};

export class SchedulerPublishStateService {
  private readonly logContext = 'SchedulerPublishStateService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly postLifecycleService: PostLifecycleService,
  ) {}

  async transitionPost(
    post: SchedulerPublishPostIdentity,
    update: SchedulerPublishTargetUpdate,
    reason?: string,
    guard?: SchedulerPublishTransitionGuard,
    finalization?: SchedulerPublishFinalizationInput,
  ): Promise<boolean> {
    const groupId = this.readIdentifier(post.groupId);
    const organizationId = this.readIdentifier(post.organizationId);
    const postId = this.readIdentifier(post.id);
    if (!organizationId || !postId) {
      return false;
    }

    return this.transition({
      groupId,
      finalization,
      guard,
      organizationId,
      postId,
      reason,
      update,
    });
  }

  async transition(input: SchedulerPublishStateInput): Promise<boolean> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt++) {
      try {
        const applied = await this.prisma.$transaction(
          (tx) => this.applyTransition(input, tx),
          // Read after exclusive F is granted: a pre-fence snapshot can miss
          // a projection's newly committed dependencies during invalidation.
          { isolationLevel: 'ReadCommitted' },
        );
        return applied;
      } catch (error: unknown) {
        if (
          !this.isSerializationFailure(error) ||
          attempt === MAX_SERIALIZABLE_ATTEMPTS
        ) {
          throw error;
        }
        this.logger.warn(`${this.logContext} retrying concurrent roll-up`, {
          attempt,
          groupId: input.groupId,
          postId: input.postId,
        });
      }
    }
    return false;
  }

  private async applyTransition(
    input: SchedulerPublishStateInput,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    await learningFence(tx, 'exclusive');
    const request = this.buildTransitionRequest(input);

    const where = {
      id: input.postId,
      organizationId: input.organizationId,
      isDeleted: false,
    };
    const discovered = await tx.post.findFirst({
      where,
      select: { ...learningPublicationPostSelect, workflowExecutionId: true },
    });
    if (!discovered) {
      const unavailable = await this.postLifecycleService.transition(
        request,
        tx,
      );
      if (unavailable.kind === 'stale') return false;
      if (input.groupId)
        await this.rollUpRelease({ ...input, groupId: input.groupId }, tx);
      return true;
    }
    const { before, lockedAccounts, accountWhere } =
      await this.lockPublicationSource(input, tx, discovered);

    if (
      (input.guard?.expectedExternalId !== undefined &&
        before.externalId !== input.guard.expectedExternalId) ||
      (input.guard?.expectedWorkflowExecutionId !== undefined &&
        before.workflowExecutionId !==
          input.guard.expectedWorkflowExecutionId) ||
      (input.guard?.priorExecutionStates &&
        !input.guard.priorExecutionStates.includes(
          before.targetExecutionState as TargetExecutionState,
        ))
    ) {
      this.logger.warn(`${this.logContext} ignored stale publish transition`, {
        postId: input.postId,
        ...input.guard,
      });
      return false;
    }
    const transition = await this.postLifecycleService.transition(request, tx);
    if (transition.kind === 'stale') {
      this.logger.warn(`${this.logContext} ignored stale publish transition`, {
        expectedWorkflowExecutionId: input.guard?.expectedWorkflowExecutionId,
        groupId: input.groupId,
        postId: input.postId,
        priorExecutionStates: input.guard?.priorExecutionStates,
      });
      return false;
    }

    const after = await tx.post.findFirst({
      where,
      select: learningPublicationPostSelect,
    });
    if (!after)
      throw new ConflictException(
        'Publication source disappeared after transition.',
      );
    const newPublic =
      after.targetExecutionState === TargetExecutionState.PUBLISHED &&
      after.visibility === PostVisibility.PUBLIC &&
      !(
        before.targetExecutionState === TargetExecutionState.PUBLISHED &&
        before.visibility === PostVisibility.PUBLIC
      );
    let associationInserted = false;
    if (newPublic && input.finalization) {
      const result = this.publicationResult(input.finalization.result);
      const existing = await tx.postPublishFinalization.findUnique({
        where: {
          organizationId_postId: {
            organizationId: input.organizationId,
            postId: input.postId,
          },
        },
      });
      if (
        !existing &&
        result &&
        result.externalId === after.externalId &&
        result.platform === fromPrismaCredentialPlatform(after.platform ?? '')
      ) {
        const association = await loadLearningPublicationAssociationV1(
          tx,
          input.organizationId,
          input.postId,
        );
        await tx.postPublishFinalization.create({
          data: {
            organizationId: input.organizationId,
            postId: input.postId,
            result: {
              ...result,
              ...(association ? { learningPublication: association } : {}),
            },
            source: input.finalization.source,
          },
        });
        associationInserted = association !== null;
      }
    }
    if (
      associationInserted ||
      this.factualTuple(before) !== this.factualTuple(after)
    ) {
      await invalidateLearningDependencySource(
        tx,
        'post',
        input.postId,
        input.organizationId,
      );
      for (const account of lockedAccounts) {
        const updated = await tx.contentLearningAccount.updateMany({
          where: { ...accountWhere, id: account.id },
          data: { evidenceRevision: { increment: 1 } },
        });
        if (updated.count !== 1)
          throw new ConflictException(
            'Publication account changed during transition.',
          );
      }
    }

    if (input.groupId) {
      await this.rollUpRelease({ ...input, groupId: input.groupId }, tx);
    }
    return true;
  }

  private buildTransitionRequest(
    input: SchedulerPublishStateInput,
  ): Parameters<PostLifecycleService['transition']>[0] {
    return {
      error: input.update.error,
      groupId: input.groupId,
      guard: input.guard,
      mutation: {
        ...(input.update.externalId !== undefined && {
          externalId: input.update.externalId,
        }),
        ...(input.update.externalShortcode !== undefined && {
          externalShortcode: input.update.externalShortcode,
        }),
        ...(input.update.lastAttemptAt !== undefined && {
          lastAttemptAt: input.update.lastAttemptAt,
        }),
        ...(input.update.publicationDate !== undefined && {
          publicationDate: input.update.publicationDate,
        }),
        ...(input.update.publishedAt !== undefined && {
          publishedAt: input.update.publishedAt,
        }),
        ...(input.update.retryCount !== undefined && {
          retryCount: input.update.retryCount,
        }),
        ...(input.update.url !== undefined && {
          url: input.update.url,
        }),
        ...(input.update.workflowExecutionId !== undefined && {
          workflowExecutionId: input.update.workflowExecutionId,
        }),
      },
      nextState: input.update.executionState,
      organizationId: input.organizationId,
      postId: input.postId,
      reason: input.reason,
      visibility: input.update.visibility,
    };
  }

  private async lockPublicationSource(
    input: SchedulerPublishStateInput,
    tx: Prisma.TransactionClient,
    discovered: SchedulerPublicationSourceRow,
  ) {
    const where = {
      id: input.postId,
      organizationId: input.organizationId,
      isDeleted: false,
    };
    const accountWhere = {
      organizationId: input.organizationId,
      brandId: discovered.brandId,
      credentialId: discovered.credentialId ?? '',
      isDeleted: false,
    };
    const accounts = await tx.contentLearningAccount.findMany({
      where: accountWhere,
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const account of accounts) {
      await tx.$queryRaw`SELECT id FROM content_learning_accounts WHERE id = ${account.id} AND "organizationId" = ${input.organizationId} AND "brandId" = ${discovered.brandId} AND "credentialId" = ${discovered.credentialId} AND "isDeleted" = false ORDER BY id FOR UPDATE`;
    }
    const lockedAccounts = await tx.contentLearningAccount.findMany({
      where: {
        ...accountWhere,
        id: { in: accounts.map((account) => account.id) },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${input.organizationId} AND "isDeleted" = false ORDER BY id FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM brands WHERE id = ${discovered.brandId} AND "organizationId" = ${input.organizationId} AND "isDeleted" = false ORDER BY id FOR SHARE`;
    if (discovered.credentialId)
      await tx.$queryRaw`SELECT id FROM credentials WHERE id = ${discovered.credentialId} AND "organizationId" = ${input.organizationId} AND "brandId" = ${discovered.brandId} AND "isDeleted" = false ORDER BY id FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM posts WHERE id = ${input.postId} AND "organizationId" = ${input.organizationId} AND "isDeleted" = false ORDER BY id FOR UPDATE`;
    const before = await tx.post.findFirst({
      where,
      select: { ...learningPublicationPostSelect, workflowExecutionId: true },
    });
    if (
      !before ||
      before.organizationId !== discovered.organizationId ||
      before.brandId !== discovered.brandId ||
      before.credentialId !== discovered.credentialId
    )
      throw new ConflictException(
        'Publication source identity changed during discovery.',
      );
    if (before.publishApprovalId)
      await tx.$queryRaw`SELECT id FROM publish_approvals WHERE id = ${before.publishApprovalId} AND "organizationId" = ${input.organizationId} AND "brandId" = ${before.brandId} AND "postId" = ${before.id} ORDER BY id FOR SHARE`;
    const approval = before.publishApprovalId
      ? await tx.publishApproval.findFirst({
          where: {
            id: before.publishApprovalId,
            organizationId: input.organizationId,
            brandId: before.brandId,
            postId: before.id,
          },
          select: { artifactVersionPinId: true },
        })
      : null;
    const pinId = approval?.artifactVersionPinId;
    if (pinId)
      await tx.$queryRaw`SELECT id FROM content_version_pins WHERE id = ${pinId} AND "organizationId" = ${input.organizationId} AND "brandId" = ${before.brandId} AND "recordKind" = 'post' AND "recordId" = ${before.id} ORDER BY id FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM post_publish_finalizations WHERE "organizationId" = ${input.organizationId} AND "postId" = ${before.id} ORDER BY id FOR UPDATE`;
    return { before, lockedAccounts, accountWhere };
  }

  private factualTuple(post: LearningPublicationPostRow): string {
    return JSON.stringify([
      post.organizationId,
      post.brandId,
      post.credentialId,
      post.id,
      post.targetExecutionState,
      post.visibility,
      post.externalId,
      post.publishedAt?.toISOString() ?? null,
      post.description,
      post.category,
      post.format,
      post.isDeleted,
    ]);
  }

  private publicationResult(
    value: Prisma.InputJsonValue,
  ): Prisma.InputJsonObject | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const result = value as Prisma.InputJsonObject;
    if (
      result.success !== true ||
      result.executionState !== TargetExecutionState.PUBLISHED ||
      result.isProviderDraft === true ||
      typeof result.externalId !== 'string' ||
      !result.externalId.trim() ||
      typeof result.platform !== 'string'
    )
      return null;
    return {
      success: true,
      executionState: TargetExecutionState.PUBLISHED,
      externalId: result.externalId,
      platform: result.platform,
      url: typeof result.url === 'string' ? result.url : '',
      ...(typeof result.externalShortcode === 'string'
        ? { externalShortcode: result.externalShortcode }
        : {}),
      ...(typeof result.error === 'string' ? { error: result.error } : {}),
      ...(result.isProviderDraft === false ? { isProviderDraft: false } : {}),
    };
  }

  private async rollUpRelease(
    input: SchedulerPublishStateInput & { groupId: string },
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const [group, targets] = await Promise.all([
      tx.postGroup.findFirst({
        select: {
          id: true,
          publishedAt: true,
        },
        where: {
          id: input.groupId,
          isDeleted: false,
          organizationId: input.organizationId,
        },
      }) as Promise<SchedulerGroupRow | null>,
      tx.post.findMany({
        select: { targetExecutionState: true },
        where: {
          groupId: input.groupId,
          isDeleted: false,
          organizationId: input.organizationId,
          parentId: null,
        },
      }),
    ]);
    if (!group) {
      throw new Error(
        `Scheduler release ${input.groupId} is no longer available.`,
      );
    }

    const projection = deriveReleaseStatusProjectionFromTargets(
      targets.map((target) => target.targetExecutionState),
    );
    for (const diagnostic of projection.diagnostics) {
      this.logger.warn(
        `${this.logContext} release status derivation failed closed`,
        {
          ...diagnostic,
          groupId: group.id,
          postId: input.postId,
        },
      );
    }
    const terminalPublished =
      projection.status === ReleaseStatus.PUBLISHED ||
      projection.status === ReleaseStatus.PARTIALLY_PUBLISHED;
    if (terminalPublished && !group.publishedAt) {
      const updatedGroup = await tx.postGroup.updateMany({
        data: { publishedAt: new Date() },
        where: {
          id: input.groupId,
          isDeleted: false,
          organizationId: input.organizationId,
        },
      });
      if (updatedGroup.count !== 1) {
        throw new Error(
          `Scheduler release ${input.groupId} is no longer available.`,
        );
      }
    }
  }

  private readIdentifier(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value.trim() || undefined;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }
    if (value && typeof value === 'object') {
      if ('id' in value) {
        const nestedId = this.readIdentifier(value.id);
        if (nestedId) {
          return nestedId;
        }
      }
      if (!('toString' in value) || typeof value.toString !== 'function') {
        return undefined;
      }
      const identifier = value.toString();
      return identifier && identifier !== '[object Object]'
        ? identifier
        : undefined;
    }
    return undefined;
  }

  private isSerializationFailure(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('code' in error)) return false;
    if (error.code === 'P2034') return true;
    if (error.code !== 'P2010' || !('meta' in error)) return false;
    const meta = error.meta;
    if (!meta || typeof meta !== 'object') return false;
    if ('code' in meta && (meta.code === '40001' || meta.code === '40P01'))
      return true;
    if (!('driverAdapterError' in meta)) return false;
    const adapter = meta.driverAdapterError;
    if (!adapter || typeof adapter !== 'object' || !('cause' in adapter))
      return false;
    const cause = adapter.cause;
    return (
      !!cause &&
      typeof cause === 'object' &&
      'originalCode' in cause &&
      (cause.originalCode === '40001' || cause.originalCode === '40P01')
    );
  }
}

export async function queueLearningPublicationRefreshV1(
  queue: WorkflowExecutionQueueService,
  logger: LoggerService,
  post: Pick<Post, 'organizationId' | 'credentialId'>,
): Promise<void> {
  const { organizationId, credentialId } = post;
  if (
    !credentialId ||
    !organizationId ||
    organizationId.length > 256 ||
    credentialId.length > 256 ||
    !organizationId.trim() ||
    !credentialId.trim()
  )
    return;
  try {
    await queue.queueSystemWorkflow(
      {
        actionType: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        canonicalId: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        organizationId,
        inputValues: { credentialId },
        source: 'publication-learning-refresh',
      },
      `learning-materialize-${learningHash(['publication-refresh-v1', organizationId, credentialId, Math.floor(Date.now() / 300000)])}`,
      { attempts: 3, dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
    );
  } catch (error: unknown) {
    logger.warn('Failed to queue publication learning refresh', {
      organizationId,
      credentialId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
