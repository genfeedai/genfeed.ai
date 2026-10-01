import {
  LearningCheckpointService,
  learningCheckpointCollection,
} from '@api/collections/content-learning/services/learning-checkpoint.service';
import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
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
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
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
      return this.reconcile(organizationId);
    if (action === CONTENT_LEARNING_ACTION_IDS.RETENTION)
      return this.retention(organizationId);
    if (action === CONTENT_LEARNING_ACTION_IDS.CHECKPOINT) {
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
      if (fulfilled) {
        const collection = learningCheckpointCollection(fulfilled);
        return {
          status:
            collection?.outcome === 'observed' ? 'completed' : 'unavailable',
          checkpointId: fulfilled.id,
          reason:
            collection?.outcome === 'observed'
              ? 'already_observed'
              : collection?.reasonCode,
        };
      }
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
      const collection = attempt ? learningCheckpointCollection(attempt) : null;
      return {
        status:
          collection?.outcome === 'observed'
            ? 'completed'
            : collection?.outcome === 'terminal_unavailable'
              ? 'unavailable'
              : 'pending',
        checkpointId: attempt?.id ?? null,
        reason:
          collection?.reasonCode ??
          (attempt ? attempt.validity : 'observation_receipt_missing'),
      };
    }
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

  private async disposeInvalidDispatch(
    organizationId: string,
    operationId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'shared');
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
  async reconcile(organizationId: string) {
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
