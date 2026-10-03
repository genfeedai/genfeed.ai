import { LearningBaselineMaterializationService } from '@api/collections/content-learning/services/learning-baseline-materialization.service';
import {
  LearningCheckpointService,
  learningCheckpointCollection,
} from '@api/collections/content-learning/services/learning-checkpoint.service';
import {
  LearningDependencyService,
  learningFence,
  learningOrgFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import { validLearningCheckpointPublicationV1 } from '@api/collections/content-learning/services/learning-publication-source.helper';
import { LearningRewardService } from '@api/collections/content-learning/services/learning-reward.service';
import { LearningRunService } from '@api/collections/content-learning/services/learning-run.service';
import { analyticsPostRefreshWorkflowId } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  CONTENT_LEARNING_ACTION_IDS,
  CONTENT_LEARNING_WORKFLOW_TEMPLATES,
  type ContentLearningActionId,
} from '@api/collections/workflows/templates/content-learning-workflows.template';
import type { WorkflowDefinitionInput } from '@api/collections/workflows/workflow-version-definition';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import {
  LEARNING_REGISTERED_CONFIG_VERSIONS,
  type LearningScope,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import {
  learningDescriptorTuple,
  validLearningDescriptor,
} from '@genfeedai/harness';
import type {
  ContentLearningAccount,
  ContentLearningCheckpoint,
  ContentLearningScopeState,
} from '@genfeedai/prisma';
import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

type RefreshInput = {
  credentialId?: string;
  materializationOnly?: boolean;
  accountCursor?: string;
  scopeCursor?: string;
  refreshBucket?: number;
};
@Injectable()
export class ContentLearningWorkflowService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly policies: LearningPolicyService,
    private readonly runs: LearningRunService,
    private readonly dependencies: LearningDependencyService,
    private readonly checkpoints: LearningCheckpointService,
    private readonly materializer: LearningBaselineMaterializationService,
    private readonly rewards: LearningRewardService,
  ) {}
  onModuleInit(): void {
    for (const template of CONTENT_LEARNING_WORKFLOW_TEMPLATES)
      this.runner.registerWorkflow({
        canonicalId: template.id,
        label: template.name,
        description: template.description,
        version: template.version,
        changeSummary: template.changeSummary,
        resultNodeId: 'learning-action',
        definition: {
          nodes: template.nodes ?? [],
          edges: template.edges ?? [],
          inputVariables: (template.inputVariables ??
            []) as WorkflowDefinitionInput['inputVariables'],
        },
      });
  }
  private id(value: unknown, name: string): string {
    if (typeof value !== 'string' || !value || value.length > 256)
      throw new BadRequestException(`${name} required`);
    return value;
  }
  async queueCheckpoint(
    organizationId: string,
    postId: string,
  ): Promise<string | null> {
    const post = await this.prisma.post.findFirst({
      where: scopedWhere(organizationId, {
        id: postId,
        ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
      }),
    });
    if (!post?.credentialId || !post.publishedAt) return null;
    const account = await this.prisma.contentLearningAccount.findFirst({
      where: {
        organizationId,
        credentialId: post.credentialId,
        isDeleted: false,
      },
    });
    if (account?.mode === 'disabled') return null;
    if (
      await this.checkpoints.fulfilledWindow(
        organizationId,
        post.id,
        post.credentialId,
        post.publishedAt,
      )
    )
      return null;
    const due = post.publishedAt.getTime() + 48 * 3600000;
    if (Date.now() > due + 3600000) return null;
    return this.queue.queueSystemWorkflow(
      {
        actionType: CONTENT_LEARNING_ACTION_IDS.CHECKPOINT,
        canonicalId: CONTENT_LEARNING_ACTION_IDS.CHECKPOINT,
        organizationId,
        inputValues: { postId },
        postIds: [postId],
        source: 'content-learning-finalization',
      },
      `learning-checkpoint-${postId}-48h-v1`,
      {
        attempts: 3,
        delayMs: Math.max(0, due - Date.now()),
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
      },
    );
  }
  async execute(
    action: ContentLearningActionId,
    organizationId: string,
    input: Record<string, unknown>,
  ) {
    if (action === CONTENT_LEARNING_ACTION_IDS.RECONCILE)
      return this.reconcile(organizationId, input);
    if (action === CONTENT_LEARNING_ACTION_IDS.RETENTION)
      return this.retention(organizationId);
    if (action === CONTENT_LEARNING_ACTION_IDS.CHECKPOINT)
      return this.executeCheckpoint(organizationId, input);
    if (action === CONTENT_LEARNING_ACTION_IDS.ACCOUNT_REBUILD) {
      const credentialId = this.id(input.credentialId, 'credentialId'),
        scopeKey = this.id(input.scopeKey, 'scopeKey');
      const account = await this.prisma.contentLearningAccount.findFirst({
        where: { organizationId, credentialId, isDeleted: false },
      });
      if (!account || account.mode === 'disabled')
        return { status: 'unavailable', reason: 'account_unavailable' };
      const policy = await this.policies.rebuild(
        organizationId,
        credentialId,
        scopeKey,
      );
      return {
        status: policy ? 'completed' : 'unavailable',
        policyId: policy?.id ?? null,
      };
    }
    return this.executeStoredOperation(action, organizationId, input);
  }
  private async executeStoredOperation(
    action: ContentLearningActionId,
    organizationId: string,
    input: Record<string, unknown>,
  ) {
    const operationId = this.id(input.operationId, 'operationId');
    const operation = await this.prisma.contentLearningOperation.findFirst({
      where: {
        id: operationId,
        organizationId,
        isDeleted: false,
        type:
          action === CONTENT_LEARNING_ACTION_IDS.DATASET_TRAIN
            ? 'dataset-train'
            : 'dataset-evaluate',
      },
    });
    if (!operation)
      throw new BadRequestException('Stored authorized operation required');
    const refs = operation.resultReferences;
    if (
      !refs ||
      typeof refs !== 'object' ||
      Array.isArray(refs) ||
      typeof refs.runId !== 'string' ||
      refs.runId.length === 0 ||
      refs.runId.length > 256
    ) {
      await this.disposeInvalidDispatch(organizationId, operation.id);
      return {
        operationId: operation.id,
        status: 'failed',
        runStatus: null,
        reason: 'dispatch_receipt_invalid',
      };
    }
    await this.runs.execute({
      runId: refs.runId,
      operationId: operation.id,
      organizationId,
    });
    const authoritative = await this.prisma.contentLearningOperation.findFirst({
      where: { id: operation.id, organizationId, isDeleted: false },
    });
    const run = await this.prisma.contentLearningRun.findFirst({
      where: { id: refs.runId, isDeleted: false },
    });
    return {
      operationId: operation.id,
      runStatus: run?.status ?? null,
      status: authoritative?.status ?? 'unavailable',
      reason: authoritative?.error ?? null,
    };
  }

  private async executeCheckpoint(
    organizationId: string,
    input: Record<string, unknown>,
  ) {
    const postId = this.id(input.postId, 'postId');
    const post = await this.prisma.post.findFirst({
      where: scopedWhere(organizationId, {
        id: postId,
        ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
      }),
    });
    if (!post?.credentialId || !post.publishedAt)
      return { status: 'unavailable', reason: 'publication_unavailable' };
    const account = await this.prisma.contentLearningAccount.findFirst({
      where: {
        organizationId,
        credentialId: post.credentialId,
        isDeleted: false,
      },
    });
    if (account?.mode === 'disabled')
      return { status: 'unavailable', reason: 'disabled' };
    const fulfilled = await this.checkpoints.fulfilledWindow(
      organizationId,
      post.id,
      post.credentialId,
      post.publishedAt,
    );
    if (fulfilled)
      return this.checkpointResult(
        organizationId,
        post.credentialId,
        fulfilled,
        true,
      );
    const age = Date.now() - post.publishedAt.getTime();
    if (age < 48 * 3600000 || age > 49 * 3600000)
      return { status: 'unavailable', reason: 'missed_window' };
    const platform = fromPrismaCredentialPlatform(post.platform);
    if (!platform || !Object.values(CredentialPlatform).includes(platform))
      return { status: 'unavailable', reason: 'unsupported_metric' };
    await this.runner.runWorkflow({
      canonicalId: analyticsPostRefreshWorkflowId(platform),
      actionType: analyticsPostRefreshWorkflowId(platform),
      organizationId,
      inputValues: { postId },
      postIds: [postId],
      source: 'content-learning-checkpoint',
    });
    const receipt = await this.checkpoints.fulfilledWindow(
      organizationId,
      post.id,
      post.credentialId,
      post.publishedAt,
    );
    const attempt =
      receipt ??
      (await this.checkpoints.latestAttempt(
        organizationId,
        post.id,
        post.credentialId,
        post.publishedAt,
      ));
    return this.checkpointResult(
      organizationId,
      post.credentialId,
      attempt,
      false,
    );
  }
  private async checkpointResult(
    organizationId: string,
    credentialId: string,
    row: ContentLearningCheckpoint | null,
    preexisting: boolean,
  ) {
    const collection = row ? learningCheckpointCollection(row) : null;
    if (row && collection?.outcome === 'observed') {
      const cutoff = new Date();
      await this.refreshTarget(organizationId, credentialId, {}, cutoff);
      if (row.validity !== 'valid')
        return {
          status: 'unavailable',
          checkpointId: row.id,
          reason: row.validity,
        };
      if (!(await validLearningCheckpointPublicationV1(this.prisma, row)))
        return {
          status: 'unavailable',
          checkpointId: row.id,
          reason: 'publication_source_unavailable',
        };
      // Rewards only; no ACCOUNT_REBUILD is queued while every logged
      // decision is a baseline-arm control (plan revision 6, D-13).
      const reward = await this.rewards.commitForCheckpoint(
        organizationId,
        row.id,
      );
      return {
        status: 'completed',
        checkpointId: row.id,
        reason: preexisting ? 'already_observed' : collection.reasonCode,
        result: {
          reward:
            reward.status === 'committed'
              ? {
                  status: reward.status,
                  rewardId: reward.rewardId,
                  rewardStatus: reward.rewardStatus,
                  reason: null,
                }
              : {
                  status: reward.status,
                  rewardId: null,
                  rewardStatus: null,
                  reason: reward.reason,
                },
        },
      };
    }
    return {
      status:
        collection?.outcome === 'terminal_unavailable'
          ? 'unavailable'
          : 'pending',
      checkpointId: row?.id ?? null,
      reason:
        collection?.reasonCode ??
        (row ? row.validity : 'observation_receipt_missing'),
    };
  }
  private async disposeInvalidDispatch(
    organizationId: string,
    operationId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await learningOrgFence(tx, organizationId, 'shared');
      await tx.$queryRaw`SELECT id FROM content_learning_operations WHERE id=${operationId} AND "organizationId"=${organizationId} AND "isDeleted"=false FOR UPDATE`;
      return tx.contentLearningOperation.updateMany({
        where: {
          id: operationId,
          organizationId,
          isDeleted: false,
          status: { in: ['pending', 'running'] },
        },
        data: { status: 'failed', error: 'dispatch_receipt_invalid' },
      });
    });
  }
  private validRefreshId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 256;
  }
  private int32(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= 2147483647;
  }
  private parseRefreshInput(input: Record<string, unknown>): RefreshInput {
    const {
      credentialId,
      materializationOnly,
      accountCursor,
      scopeCursor,
      refreshBucket,
    } = input;
    if (
      (credentialId !== undefined && !this.validRefreshId(credentialId)) ||
      (materializationOnly !== undefined &&
        typeof materializationOnly !== 'boolean') ||
      (accountCursor !== undefined &&
        (!this.validRefreshId(accountCursor) ||
          accountCursor.trim() !== accountCursor)) ||
      (scopeCursor !== undefined &&
        (!this.validRefreshId(scopeCursor) ||
          scopeCursor.trim() !== scopeCursor)) ||
      (refreshBucket !== undefined &&
        (typeof refreshBucket !== 'number' ||
          !Number.isSafeInteger(refreshBucket) ||
          refreshBucket < 0)) ||
      (scopeCursor !== undefined && credentialId === undefined) ||
      (accountCursor !== undefined &&
        (credentialId !== undefined || scopeCursor !== undefined))
    )
      throw new BadRequestException('Invalid learning materialization input');
    return {
      ...(credentialId !== undefined ? { credentialId } : {}),
      ...(materializationOnly !== undefined ? { materializationOnly } : {}),
      ...(accountCursor !== undefined ? { accountCursor } : {}),
      ...(scopeCursor !== undefined ? { scopeCursor } : {}),
      ...(refreshBucket !== undefined ? { refreshBucket } : {}),
    };
  }
  private validRefreshAccount(
    row: ContentLearningAccount,
    organizationId: string,
    credentialId?: string,
  ): boolean {
    return (
      row.organizationId === organizationId &&
      !row.isDeleted &&
      row.mode !== 'disabled' &&
      this.validRefreshId(row.id) &&
      this.validRefreshId(row.brandId) &&
      this.validRefreshId(row.credentialId) &&
      (credentialId === undefined || row.credentialId === credentialId) &&
      [row.epoch, row.evidenceRevision, row.revision].every((value) =>
        this.int32(value),
      )
    );
  }
  private async readRefreshAccount(
    organizationId: string,
    credentialId: string,
  ) {
    const account = await this.prisma.contentLearningAccount.findFirst({
      where: {
        organizationId,
        credentialId,
        isDeleted: false,
        mode: { not: 'disabled' },
      },
    });
    if (
      !account ||
      !this.validRefreshAccount(account, organizationId, credentialId) ||
      !['shadow', 'paused', 'live'].includes(account.mode) ||
      !LEARNING_REGISTERED_CONFIG_VERSIONS.some(
        (version) => version === account.activeConfigVersion,
      )
    )
      return null;
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
    });
    if (
      !organization ||
      organization.id !== organizationId ||
      organization.isDeleted
    )
      return null;
    const brand = await this.prisma.brand.findFirst({
      where: {
        id: account.brandId,
        organizationId,
        isDeleted: false,
        isActive: true,
      },
    });
    if (
      !brand ||
      brand.id !== account.brandId ||
      brand.organizationId !== organizationId ||
      brand.isDeleted ||
      !brand.isActive
    )
      return null;
    const credential = await this.prisma.credential.findFirst({
      where: {
        id: credentialId,
        organizationId,
        brandId: account.brandId,
        isDeleted: false,
        isConnected: true,
      },
    });
    if (
      !credential ||
      credential.id !== credentialId ||
      credential.organizationId !== organizationId ||
      credential.brandId !== account.brandId ||
      credential.isDeleted ||
      !credential.isConnected
    )
      return null;
    const platform = fromPrismaCredentialPlatform(credential.platform);
    return platform ? { account, platform } : null;
  }
  private refreshScope(
    row: ContentLearningScopeState,
    context: NonNullable<
      Awaited<ReturnType<ContentLearningWorkflowService['readRefreshAccount']>>
    >,
  ) {
    const { account, platform } = context,
      descriptor = row.cellDescriptor;
    if (
      row.organizationId !== account.organizationId ||
      row.brandId !== account.brandId ||
      row.credentialId !== account.credentialId ||
      row.epoch !== account.epoch ||
      row.isDeleted ||
      !this.int32(row.revision) ||
      !validLearningDescriptor(descriptor) ||
      descriptor.configVersion !== account.activeConfigVersion ||
      descriptor.platform !== platform ||
      descriptor.format !== 'text' ||
      row.descriptorHash !== learningHash(learningDescriptorTuple(descriptor))
    )
      return null;
    const scope: LearningScope = {
      organizationId: account.organizationId,
      brandId: account.brandId,
      credentialId: account.credentialId,
      platform: descriptor.platform,
      format: descriptor.format,
      objective: descriptor.objective,
      rewardProfileId: row.descriptorHash,
    };
    return row.scopeKey === learningScopeKey(scope)
      ? { scope, descriptor }
      : null;
  }
  private async refreshTarget(
    organizationId: string,
    credentialId: string,
    input: RefreshInput,
    cutoff: Date,
  ) {
    const context = await this.readRefreshAccount(organizationId, credentialId);
    if (!context)
      return {
        status: 'unavailable',
        reason: 'account_unavailable',
        queued: 0,
        failed: 0,
      };
    const rows = await this.prisma.contentLearningScopeState.findMany({
      where: scopedWhere(organizationId, {
        brandId: context.account.brandId,
        credentialId,
        epoch: context.account.epoch,
        ...(input.scopeCursor ? { id: { gt: input.scopeCursor } } : {}),
      }),
      orderBy: { id: 'asc' },
      take: 9,
    });
    for (const row of rows.slice(0, 8)) {
      const projection = this.refreshScope(row, context);
      if (projection)
        await this.materializer.materialize(
          projection.scope,
          projection.descriptor,
          cutoff,
        );
    }
    let queued = 0;
    const last = rows[7];
    if (rows.length > 8 && last) {
      await this.queueRefreshContinuation(
        organizationId,
        input.refreshBucket ?? Math.floor(cutoff.getTime() / 300000),
        { credentialId, scopeCursor: last.id },
      );
      queued++;
    }
    return { status: 'completed', queued, failed: 0 };
  }
  private async queueRefreshTarget(
    organizationId: string,
    account: ContentLearningAccount,
    bucket: number,
  ) {
    return this.queue.queueSystemWorkflow(
      {
        organizationId,
        actionType: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        canonicalId: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        inputValues: {
          credentialId: account.credentialId,
          materializationOnly: true,
          refreshBucket: bucket,
        },
        source: 'content-learning-reconcile',
      },
      'learning-materialize-' +
        learningHash([
          organizationId,
          account.credentialId,
          account.epoch,
          account.evidenceRevision,
          bucket,
        ]),
      { attempts: 3, dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
    );
  }
  private async queueRefreshContinuation(
    organizationId: string,
    bucket: number,
    cursors: Pick<
      RefreshInput,
      'credentialId' | 'accountCursor' | 'scopeCursor'
    >,
  ) {
    return this.queue.queueSystemWorkflow(
      {
        organizationId,
        actionType: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        canonicalId: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        inputValues: {
          materializationOnly: true,
          refreshBucket: bucket,
          ...cursors,
        },
        source: 'content-learning-reconcile',
      },
      'learning-materialize-' +
        learningHash([
          'continuation-v1',
          organizationId,
          bucket,
          cursors.credentialId ?? null,
          cursors.accountCursor ?? null,
          cursors.scopeCursor ?? null,
        ]),
      { attempts: 3, dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
    );
  }
  private async refreshSweep(
    organizationId: string,
    input: RefreshInput,
    cutoff: Date,
  ) {
    const rows = await this.prisma.contentLearningAccount.findMany({
      where: scopedWhere(organizationId, {
        mode: { not: 'disabled' },
        ...(input.accountCursor ? { id: { gt: input.accountCursor } } : {}),
      }),
      orderBy: { id: 'asc' },
      take: 51,
    });
    const bucket = input.refreshBucket ?? Math.floor(cutoff.getTime() / 300000);
    let queued = 0;
    for (const row of rows.slice(0, 50))
      if (this.validRefreshAccount(row, organizationId)) {
        await this.queueRefreshTarget(organizationId, row, bucket);
        queued++;
      }
    const last = rows[49];
    if (rows.length > 50 && last) {
      await this.queueRefreshContinuation(organizationId, bucket, {
        accountCursor: last.id,
      });
      queued++;
    }
    return queued;
  }
  async reconcile(organizationId: string, input: Record<string, unknown> = {}) {
    const parsed = this.parseRefreshInput(input),
      cutoff = new Date();
    if (parsed.credentialId !== undefined)
      return this.refreshTarget(
        organizationId,
        parsed.credentialId,
        parsed,
        cutoff,
      );
    const queued = await this.refreshSweep(organizationId, parsed, cutoff);
    if (parsed.materializationOnly === true)
      return { status: 'completed', queued, failed: 0 };
    const stored = await this.reconcileStoredWork(organizationId);
    return {
      status: 'completed',
      queued: queued + stored.queued,
      failed: stored.failed,
    };
  }
  private async reconcileStoredWork(organizationId: string) {
    const posts = await this.prisma.post.findMany({
      where: scopedWhere(organizationId, {
        credentialId: { not: null },
        publishedAt: { gte: new Date(Date.now() - 49 * 3600000) },
        ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
      }),
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    let queued = 0,
      failed = 0;
    for (const post of posts)
      if (await this.queueCheckpoint(organizationId, post.id)) queued++;
    const operations = await this.prisma.contentLearningOperation.findMany({
      where: {
        organizationId,
        isDeleted: false,
        status: { in: ['pending', 'running'] },
        type: { in: ['dataset-train', 'dataset-evaluate'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    for (const operation of operations) {
      try {
        const refs = operation.resultReferences;
        if (
          !refs ||
          typeof refs !== 'object' ||
          Array.isArray(refs) ||
          typeof refs.runId !== 'string' ||
          refs.runId.length === 0 ||
          refs.runId.length > 256
        ) {
          await this.disposeInvalidDispatch(organizationId, operation.id);
          continue;
        }
        const repaired = await this.runs.reconcileDispatch({
          runId: refs.runId,
          operationId: operation.id,
          organizationId,
        });
        if (!repaired.dispatchable) continue;
        const action =
          operation.type === 'dataset-train'
            ? CONTENT_LEARNING_ACTION_IDS.DATASET_TRAIN
            : CONTENT_LEARNING_ACTION_IDS.EVALUATE;
        await this.queue.queueSystemWorkflow(
          {
            canonicalId: action,
            actionType: action,
            organizationId,
            inputValues: { operationId: operation.id },
            source: 'content-learning-reconcile',
          },
          `learning-operation-${operation.id}`,
          {
            attempts: 3,
            dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
          },
        );
        queued++;
      } catch (error) {
        if (
          error instanceof NotFoundException &&
          error.message === 'Run dispatch not found'
        )
          await this.disposeInvalidDispatch(organizationId, operation.id);
        failed++;
      }
    }
    return { status: 'completed', queued, failed };
  }
  async retention(organizationId: string) {
    const cutoff = new Date(Date.now() - 365 * 86400000);
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'exclusive');
      const expired = await tx.contentLearningDecision.findMany({
        where: { organizationId, isDeleted: false, createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      for (const row of expired)
        await this.dependencies.invalidate('decision', row.id, tx);
      const result = await tx.contentLearningDecision.updateMany({
        where: { organizationId, isDeleted: false, createdAt: { lt: cutoff } },
        data: { isDeleted: true },
      });
      const checkpoints = await tx.contentLearningCheckpoint.findMany({
        where: { organizationId, isDeleted: false, receivedAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      for (const row of checkpoints)
        await this.dependencies.invalidate('checkpoint', row.id, tx);
      await tx.contentLearningCheckpoint.updateMany({
        where: { organizationId, isDeleted: false, receivedAt: { lt: cutoff } },
        data: { isDeleted: true },
      });
      return {
        status: 'completed',
        removed: result.count + checkpoints.length,
      };
    });
  }
}
