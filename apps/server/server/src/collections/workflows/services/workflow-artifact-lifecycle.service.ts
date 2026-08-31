import { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  buildWorkflowArtifactCleanupExecutionDefinition,
  buildWorkflowArtifactCleanupSweepDefinition,
  buildWorkflowArtifactExpiredScopeDefinition,
} from '@server/collections/workflows/services/workflow-artifact-workflow-definition';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { WORKFLOW_EXECUTION_RETENTION_METADATA_KEY } from '@server/collections/workflows/workflow-execution-retention.contract';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

export const WORKFLOW_ARTIFACT_ACTION_IDS = {
  CLEANUP: 'workflow.artifact.cleanup',
  CLEANUP_EXPIRED_SCOPE: 'workflow.artifact.cleanup-expired-scope',
  DISCOVER_EXPIRED: 'workflow.artifact.discover-expired',
  PROMOTE: 'workflow.artifact.promote',
  REGISTER: 'workflow.artifact.register',
} as const;

export const WORKFLOW_ARTIFACT_BACKSTOP_MS = 24 * 60 * 60 * 1000;
const CLEANUP_LEASE_MS = 15 * 60 * 1000;
const MAX_CLEANUP_BATCH_SIZE = 100;
const PRIMARY_STORAGE_PROVIDER = 'primary';

type CleanupReason = 'terminal' | 'ttl';

type ArtifactIdentity = {
  executionId: string;
  nodeId: string;
  organizationId: string;
  storageKey: string;
  storageProvider?: string;
  retentionPolicy?: 'terminal' | 'ttl';
  metadata?: Record<string, unknown>;
};

type CleanupScope = {
  executionId: string;
  organizationId: string;
  userId: string;
};

@Injectable()
export class WorkflowArtifactLifecycleService implements OnModuleInit {
  private readonly context = 'WorkflowArtifactLifecycleService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesClient: FilesClientService,
    private readonly logger: LoggerService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      WORKFLOW_ARTIFACT_ACTION_IDS.REGISTER,
      (request) => this.registerAction(request),
    );
    this.runner.registerAction(
      WORKFLOW_ARTIFACT_ACTION_IDS.PROMOTE,
      (request) => this.promoteAction(request),
    );
    this.runner.registerAction(
      WORKFLOW_ARTIFACT_ACTION_IDS.CLEANUP,
      (request) => this.cleanupAction(request),
    );
    this.runner.registerAction(
      WORKFLOW_ARTIFACT_ACTION_IDS.DISCOVER_EXPIRED,
      () => this.discoverExpiredAction(),
    );
    this.runner.registerAction(
      WORKFLOW_ARTIFACT_ACTION_IDS.CLEANUP_EXPIRED_SCOPE,
      ({ input }) => this.cleanupExpiredScope(input.request as CleanupScope),
    );
    this.runner.registerWorkflow(
      buildWorkflowArtifactCleanupExecutionDefinition(
        WORKFLOW_ARTIFACT_ACTION_IDS.CLEANUP,
      ),
    );
    this.runner.registerWorkflow(
      buildWorkflowArtifactExpiredScopeDefinition(
        WORKFLOW_ARTIFACT_ACTION_IDS.CLEANUP_EXPIRED_SCOPE,
      ),
    );
    this.runner.registerWorkflow(
      buildWorkflowArtifactCleanupSweepDefinition(
        WORKFLOW_ARTIFACT_ACTION_IDS.DISCOVER_EXPIRED,
      ),
    );
  }

  async register(input: ArtifactIdentity & { kind: string }): Promise<{
    artifactId: string;
    expiresAt: string;
    state: string;
  }> {
    const storageProvider = input.storageProvider ?? PRIMARY_STORAGE_PROVIDER;
    if (storageProvider !== PRIMARY_STORAGE_PROVIDER) {
      throw new Error(
        `Unsupported workflow artifact storage provider: ${storageProvider}`,
      );
    }
    const execution = await this.prisma.workflowExecution.findFirst({
      select: { id: true },
      where: scopedWhere(input.organizationId, { id: input.executionId }),
    });
    if (!execution) {
      throw new Error(
        `Workflow execution ${input.executionId} was not found in organization ${input.organizationId}`,
      );
    }
    const expiresAt = new Date(Date.now() + WORKFLOW_ARTIFACT_BACKSTOP_MS);
    const artifact = await this.prisma.workflowArtifact.upsert({
      create: {
        executionId: input.executionId,
        expiresAt,
        kind: input.kind,
        metadata: this.sanitizeArtifactMetadata(input.metadata),
        nodeId: input.nodeId,
        organizationId: input.organizationId,
        retentionPolicy: input.retentionPolicy ?? 'terminal',
        storageKey: input.storageKey,
        storageProvider,
      },
      update: {},
      where: {
        executionId_nodeId_storageProvider_storageKey: {
          executionId: input.executionId,
          nodeId: input.nodeId,
          storageKey: input.storageKey,
          storageProvider,
        },
      },
    });

    return {
      artifactId: artifact.id,
      expiresAt: artifact.expiresAt.toISOString(),
      state: artifact.state,
    };
  }

  async markPromoted(input: {
    artifactId: string;
    organizationId: string;
    targetId: string;
    targetType: string;
    userId: string;
  }): Promise<{
    artifactId: string;
    state: 'PROMOTED';
    targetId: string;
    targetType: string;
  }> {
    const existing = await this.prisma.workflowArtifact.findFirst({
      where: scopedWhere(input.organizationId, { id: input.artifactId }),
    });
    if (!existing) {
      throw new Error(`Workflow artifact ${input.artifactId} was not found`);
    }
    if (existing.state === 'PROMOTED') {
      if (
        existing.promotionTargetId !== input.targetId ||
        existing.promotionTargetType !== input.targetType
      ) {
        throw new Error(
          `Workflow artifact ${input.artifactId} was already promoted to another target`,
        );
      }
      return {
        artifactId: existing.id,
        state: 'PROMOTED',
        targetId: input.targetId,
        targetType: input.targetType,
      };
    }
    if (existing.expiresAt <= new Date()) {
      throw new Error(
        `Workflow artifact ${input.artifactId} promotion window has expired`,
      );
    }

    const promoted = await this.prisma.workflowArtifact.updateMany({
      data: {
        cleanupClaimedAt: null,
        lastError: null,
        promotedAt: new Date(),
        promotedByUserId: input.userId,
        promotionTargetId: input.targetId,
        promotionTargetType: input.targetType,
        state: 'PROMOTED',
      },
      where: scopedWhere(input.organizationId, {
        id: input.artifactId,
        expiresAt: { gt: new Date() },
        state: { in: ['ACTIVE', 'CLEANUP_FAILED'] },
      } satisfies Prisma.WorkflowArtifactWhereInput),
    });
    if (promoted.count !== 1) {
      throw new Error(
        `Workflow artifact ${input.artifactId} cannot be promoted from ${existing.state}`,
      );
    }

    return {
      artifactId: input.artifactId,
      state: 'PROMOTED',
      targetId: input.targetId,
      targetType: input.targetType,
    };
  }

  async findForPromotion(
    organizationId: string,
    artifactId: string,
  ): Promise<{
    id: string;
    kind: string;
    metadata: Record<string, unknown>;
    storageKey: string;
  }> {
    const artifact = await this.prisma.workflowArtifact.findFirst({
      select: { id: true, kind: true, metadata: true, storageKey: true },
      where: scopedWhere(organizationId, {
        id: artifactId,
        OR: [
          {
            expiresAt: { gt: new Date() },
            state: { in: ['ACTIVE', 'CLEANUP_FAILED'] },
          },
          { state: 'PROMOTED' },
        ],
      } satisfies Prisma.WorkflowArtifactWhereInput),
    });
    if (!artifact) {
      throw new Error(`Workflow artifact ${artifactId} was not found`);
    }
    return { ...artifact, metadata: this.readRecord(artifact.metadata) };
  }

  async cleanupExecution(input: {
    executionId: string;
    organizationId: string;
    reason: CleanupReason;
    now?: Date;
  }): Promise<{ deleted: number; failed: number; skipped: number }> {
    const now = input.now ?? new Date();
    const staleClaim = new Date(now.getTime() - CLEANUP_LEASE_MS);
    const artifacts = await this.prisma.workflowArtifact.findMany({
      orderBy: { createdAt: 'asc' },
      take: MAX_CLEANUP_BATCH_SIZE,
      where: scopedWhere(input.organizationId, {
        executionId: input.executionId,
        ...(input.reason === 'terminal'
          ? { retentionPolicy: 'terminal' }
          : { expiresAt: { lte: now } }),
        OR: [
          { state: { in: ['ACTIVE', 'CLEANUP_FAILED'] } },
          { cleanupClaimedAt: { lte: staleClaim }, state: 'DELETING' },
        ],
      } satisfies Prisma.WorkflowArtifactWhereInput),
    });

    let deleted = 0;
    let failed = 0;
    let skipped = 0;
    for (const artifact of artifacts) {
      const claimed = await this.prisma.workflowArtifact.updateMany({
        data: {
          cleanupAttempts: { increment: 1 },
          cleanupClaimedAt: now,
          lastError: null,
          state: 'DELETING',
        },
        where: scopedWhere(input.organizationId, {
          id: artifact.id,
          ...(input.reason === 'terminal'
            ? { retentionPolicy: 'terminal' }
            : { expiresAt: { lte: now } }),
          OR: [
            { state: { in: ['ACTIVE', 'CLEANUP_FAILED'] } },
            { cleanupClaimedAt: { lte: staleClaim }, state: 'DELETING' },
          ],
        } satisfies Prisma.WorkflowArtifactWhereInput),
      });
      if (claimed.count !== 1) {
        skipped += 1;
        continue;
      }

      try {
        if (artifact.storageProvider !== PRIMARY_STORAGE_PROVIDER) {
          throw new Error(
            `Unsupported workflow artifact storage provider: ${artifact.storageProvider}`,
          );
        }
        await this.filesClient.deleteStoredObject(artifact.storageKey);
        await this.prisma.workflowArtifact.updateMany({
          data: {
            cleanupClaimedAt: null,
            isDeleted: true,
            lastError: null,
            state: 'DELETED',
          },
          where: scopedWhere(input.organizationId, {
            id: artifact.id,
            state: 'DELETING',
          } satisfies Prisma.WorkflowArtifactWhereInput),
        });
        deleted += 1;
      } catch (error: unknown) {
        const message = this.errorMessage(error);
        await this.prisma.workflowArtifact.updateMany({
          data: {
            cleanupClaimedAt: null,
            lastError: message,
            state: 'CLEANUP_FAILED',
          },
          where: scopedWhere(input.organizationId, {
            id: artifact.id,
            state: 'DELETING',
          } satisfies Prisma.WorkflowArtifactWhereInput),
        });
        this.logger.error('Workflow artifact storage deletion failed', {
          artifactId: artifact.id,
          context: this.context,
          error: message,
          executionId: input.executionId,
          organizationId: input.organizationId,
          storageProvider: artifact.storageProvider,
        });
        failed += 1;
      }
    }

    if (input.reason === 'ttl') {
      await this.purgeExpiredExecution(
        input.organizationId,
        input.executionId,
        now,
      );
    }

    return { deleted, failed, skipped };
  }

  async findExpiredExecutionScopes(now = new Date()): Promise<CleanupScope[]> {
    const staleClaim = new Date(now.getTime() - CLEANUP_LEASE_MS);
    const [artifacts, executions] = await Promise.all([
      this.prisma.workflowArtifact.findMany({
        distinct: ['organizationId', 'executionId'],
        orderBy: [{ organizationId: 'asc' }, { executionId: 'asc' }],
        select: {
          execution: { select: { userId: true } },
          executionId: true,
          organizationId: true,
        },
        take: MAX_CLEANUP_BATCH_SIZE,
        where: {
          expiresAt: { lte: now },
          isDeleted: false,
          OR: [
            { state: { in: ['ACTIVE', 'CLEANUP_FAILED'] } },
            { cleanupClaimedAt: { lte: staleClaim }, state: 'DELETING' },
          ],
        },
      }),
      this.prisma.workflowExecution.findMany({
        orderBy: { completedAt: 'asc' },
        select: { id: true, organizationId: true, userId: true },
        take: MAX_CLEANUP_BATCH_SIZE,
        where: {
          completedAt: { not: null },
          isDeleted: false,
          OR: [
            {
              payloadScrubbedAt: { not: null },
              purgeAt: { lte: now },
            },
            {
              payloadScrubbedAt: null,
              OR: [
                { purgeAfterHours: { not: null } },
                { scrubAllNodePayloads: true },
                { scrubNodeIds: { isEmpty: false } },
              ],
            },
          ],
        },
      }),
    ]);

    const scopes = new Map<string, CleanupScope>();
    for (const artifact of artifacts) {
      scopes.set(`${artifact.organizationId}:${artifact.executionId}`, {
        executionId: artifact.executionId,
        organizationId: artifact.organizationId,
        userId: artifact.execution.userId,
      });
    }
    for (const execution of executions) {
      scopes.set(`${execution.organizationId}:${execution.id}`, {
        executionId: execution.id,
        organizationId: execution.organizationId,
        userId: execution.userId,
      });
    }
    return [...scopes.values()].slice(0, MAX_CLEANUP_BATCH_SIZE);
  }

  async applyTerminalRetention(input: CleanupScope): Promise<boolean> {
    const execution = await this.prisma.workflowExecution.findFirst({
      select: {
        payloadScrubbedAt: true,
        purgeAfterHours: true,
        result: true,
        scrubAllNodePayloads: true,
        scrubNodeIds: true,
      },
      where: scopedWhere(input.organizationId, { id: input.executionId }),
    });
    if (
      !execution ||
      execution.payloadScrubbedAt ||
      (!execution.scrubAllNodePayloads && execution.scrubNodeIds.length === 0)
    ) {
      return false;
    }

    const now = new Date();
    const result = this.readRecord(execution.result);
    const metadata = this.readRecord(result.metadata);
    await this.prisma.$transaction([
      this.prisma.workflowExecutionNodeResult.updateMany({
        data: {
          input: { scrubbed: true },
          output: { scrubbed: true },
        },
        where: {
          executionId: input.executionId,
          organizationId: input.organizationId,
          ...(execution.scrubAllNodePayloads
            ? {}
            : { nodeId: { in: execution.scrubNodeIds } }),
        },
      }),
      this.prisma.workflowExecution.updateMany({
        data: {
          payloadScrubbedAt: now,
          purgeAt:
            execution.scrubAllNodePayloads && execution.purgeAfterHours
              ? new Date(
                  now.getTime() + execution.purgeAfterHours * 60 * 60 * 1000,
                )
              : null,
          result: {
            metadata,
            payloadScrubbedAt: now.toISOString(),
            scrubbed: true,
          } as Prisma.InputJsonValue,
        },
        where: scopedWhere(input.organizationId, { id: input.executionId }),
      }),
    ]);
    return true;
  }

  async scheduleTerminalCleanup(input: CleanupScope): Promise<boolean> {
    const pending = await this.prisma.workflowArtifact.count({
      where: scopedWhere(input.organizationId, {
        executionId: input.executionId,
        retentionPolicy: 'terminal',
        state: { in: ['ACTIVE', 'CLEANUP_FAILED'] },
      } satisfies Prisma.WorkflowArtifactWhereInput),
    });
    if (pending === 0) {
      return false;
    }

    try {
      await this.queueCleanup(input, 'terminal', input.executionId);
      return true;
    } catch (error: unknown) {
      this.logger.error(
        'Workflow artifact terminal cleanup scheduling failed',
        {
          context: this.context,
          error: this.errorMessage(error),
          executionId: input.executionId,
          organizationId: input.organizationId,
        },
      );
      return false;
    }
  }

  private async registerAction(
    request: SystemWorkflowActionRequest,
  ): Promise<{ artifactId: string; expiresAt: string; state: string }> {
    return this.register({
      executionId: request.context.executionId ?? request.context.runId,
      kind: this.requiredString(request.input.kind, 'kind'),
      metadata: this.readRecord(request.input.metadata),
      nodeId: this.requiredString(
        request.input.producerNodeId,
        'producerNodeId',
      ),
      organizationId: request.context.organizationId,
      storageKey: this.requiredString(request.input.storageKey, 'storageKey'),
      storageProvider:
        this.optionalString(request.input.storageProvider) ??
        PRIMARY_STORAGE_PROVIDER,
      retentionPolicy:
        request.input.retentionPolicy === 'ttl' ? 'ttl' : 'terminal',
    });
  }

  private async promoteAction(request: SystemWorkflowActionRequest): Promise<{
    artifactId: string;
    state: 'PROMOTED';
    targetId: string;
    targetType: string;
  }> {
    return this.markPromoted({
      artifactId: this.requiredString(request.input.artifactId, 'artifactId'),
      organizationId: request.context.organizationId,
      targetId: this.requiredString(request.input.targetId, 'targetId'),
      targetType: this.requiredString(request.input.targetType, 'targetType'),
      userId: request.context.userId,
    });
  }

  private async cleanupAction(
    request: SystemWorkflowActionRequest,
  ): Promise<{ deleted: number; failed: number; skipped: number }> {
    const executionId = this.requiredString(
      request.input.targetExecutionId,
      'targetExecutionId',
    );
    await this.applyTerminalRetention({
      executionId,
      organizationId: request.context.organizationId,
      userId: request.context.userId,
    });
    return this.cleanupExecution({
      executionId,
      organizationId: request.context.organizationId,
      reason: request.input.reason === 'ttl' ? 'ttl' : 'terminal',
    });
  }

  private async discoverExpiredAction(): Promise<{ items: CleanupScope[] }> {
    const now = new Date();
    const scopes = await this.findExpiredExecutionScopes(now);
    return { items: scopes };
  }

  private async cleanupExpiredScope(scope: CleanupScope) {
    const now = new Date();
    await this.applyTerminalRetention(scope);
    return this.cleanupExecution({
      executionId: scope.executionId,
      organizationId: scope.organizationId,
      reason: 'ttl',
      now,
    });
  }

  private async queueCleanup(
    input: CleanupScope,
    reason: CleanupReason,
    jobIdentity: string,
  ): Promise<void> {
    const definition = buildWorkflowArtifactCleanupExecutionDefinition(
      WORKFLOW_ARTIFACT_ACTION_IDS.CLEANUP,
    );
    await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: {
          reason,
          targetExecutionId: input.executionId,
        },
        metadata: {
          [WORKFLOW_EXECUTION_RETENTION_METADATA_KEY]: {
            purgeAfterHours: 1,
            scrubNodePayloads: 'all',
          },
        },
        organizationId: input.organizationId,
        source: `workflow_artifact_${reason}_cleanup`,
        userId: input.userId,
      },
      `${WORKFLOW_ARTIFACT_ACTION_IDS.CLEANUP}-${jobIdentity}`,
      { attempts: 3, replaceTerminalJob: true },
    );
  }

  private async purgeExpiredExecution(
    organizationId: string,
    executionId: string,
    now: Date,
  ): Promise<boolean> {
    const retainedArtifacts = await this.prisma.workflowArtifact.count({
      where: scopedWhere(organizationId, {
        executionId,
        state: { in: ['ACTIVE', 'CLEANUP_FAILED', 'DELETING', 'PROMOTED'] },
      } satisfies Prisma.WorkflowArtifactWhereInput),
    });
    if (retainedArtifacts > 0) {
      return false;
    }

    const deleted = await this.prisma.workflowExecution.deleteMany({
      where: scopedWhere(organizationId, {
        id: executionId,
        payloadScrubbedAt: { not: null },
        purgeAt: { lte: now },
      }),
    });
    return deleted.count === 1;
  }

  private requiredString(value: unknown, field: string): string {
    const parsed = this.optionalString(value);
    if (!parsed) {
      throw new Error(`${field} is required`);
    }
    return parsed;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private sanitizeArtifactMetadata(
    metadata: Record<string, unknown> | undefined,
  ): Prisma.InputJsonValue {
    const input = metadata ?? {};
    const fields = {
      resolvedUrl: 2048,
      sourceTitle: 500,
      videoId: 128,
      youtubeUrl: 2048,
    } as const;
    const sanitized: Record<string, string> = {};
    for (const [field, maxLength] of Object.entries(fields)) {
      const value = this.optionalString(input[field]);
      if (value) {
        sanitized[field] = value.slice(0, maxLength);
      }
    }
    return sanitized as Prisma.InputJsonValue;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
