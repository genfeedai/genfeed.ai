import {
  CreateWorkflowExecutionDto,
  UpdateWorkflowExecutionDto,
} from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import type {
  WorkflowExecutionDocument,
  WorkflowNodeResult,
} from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import {
  buildWorkflowOutcomeInput,
  type WorkflowExecutionCompletionRow,
} from '@api/collections/workflow-executions/services/workflow-execution-outcome.util';
import {
  composeEtaMetadata,
  readNodeResults,
  readOptionalNumber,
  readOptionalString,
  readRecord,
  toWorkflowExecutionProgressSnapshot,
  type WorkflowExecutionProgressRow,
  type WorkflowExecutionProgressSnapshot,
  type WorkflowExecutionScalarRow,
} from '@api/collections/workflow-executions/services/workflow-execution-runtime.util';
import { parseWorkflowExecutionRetention } from '@api/collections/workflows/workflow-execution-retention.contract';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import {
  normalizeActionOrigin,
  scopedWhere,
  withActionOriginMetadata,
} from '@api/index';
import { WorkflowNotificationOutboxService } from '@api/services/notifications/workflow-notifications/workflow-notification-outbox.service';
import { WorkflowEventWebhookService } from '@api/services/webhook-client/workflow-event-webhook.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PrismaFindAllInput,
} from '@api/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { formatAgentError } from '@genfeedai/agent/server';
import {
  type ActionOriginContext,
  WorkflowExecutionStatus as SharedWorkflowExecutionStatus,
} from '@genfeedai/contracts';
import type { PopulateOption } from '@genfeedai/contracts/interfaces';
import {
  Prisma,
  WorkflowExecutionStatus as PrismaWorkflowExecutionStatus,
} from '@genfeedai/prisma';
import type { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type WorkflowExecutionRuntimeStateRow = {
  creditsUsed: number | null;
  durationMs: number | null;
  estimatedDurationMs: number | null;
  etaConfidence: string | null;
  etaCurrentPhase: string | null;
  etaUpdatedAt: Date | null;
  failedNodeId: string | null;
  isDeleted: boolean;
  progress: number | null;
  remainingDurationMs: number | null;
  result: unknown;
  startedAt: Date | null;
};

type WorkflowExecutionCreateInput = CreateWorkflowExecutionDto & {
  estimatedDurationMs?: number;
  etaConfidence?: string;
  etaCurrentPhase?: string;
  idempotencyKey?: string;
  remainingDurationMs?: number;
  totalNodes?: number;
  workflowVersionId: string;
};

type WorkflowExecutionCompletionFields = {
  creditsUsed?: number;
  failedNodeId?: string | null;
};

type WorkflowExecutionProgressUpdate = {
  eta?: {
    currentPhase?: string;
    estimatedDurationMs?: number;
    etaConfidence?: string;
    lastEtaUpdateAt?: string;
    remainingDurationMs?: number;
    startedAt?: string;
  };
  progress?: number;
};

const REVIEW_GATE_RESOLUTION_LEASE_MS = 5 * 60 * 1000;

const DEFAULT_EXECUTION_POPULATE: PopulateOption[] = [
  { path: 'nodeResults' },
  { path: 'workflow', select: ['description', 'label'] },
];

export interface WorkflowExecutionRuntimeState {
  metadata?: Record<string, unknown>;
  progress?: number;
  startedAt: Date | null;
}

/** A workflow execution currently paused at a review gate. */
export interface PendingReviewGateExecution {
  executionId: string;
  workflowId: string;
  organizationId: string;
  nodeId: string;
  requestedAt: string;
  timeoutHours: number;
  autoApproveIfNoResponse: boolean;
}

@Injectable()
export class WorkflowExecutionsService extends BaseService<
  WorkflowExecutionDocument,
  CreateWorkflowExecutionDto,
  UpdateWorkflowExecutionDto
> {
  constructor(
    public readonly prisma: PrismaService,
    readonly logger: LoggerService,
    private readonly workflowEventWebhookService: WorkflowEventWebhookService,
    private readonly workflowNotificationOutboxService: WorkflowNotificationOutboxService,
  ) {
    super(prisma, 'workflowExecution', logger);
  }

  protected override normalizeDocument(
    document: unknown,
  ): WorkflowExecutionDocument {
    const normalized = super.normalizeDocument(
      document,
    ) as WorkflowExecutionDocument;
    if (!normalized || typeof normalized !== 'object') {
      return normalized;
    }

    const result = readRecord(normalized.result);
    const row = normalized as WorkflowExecutionDocument &
      WorkflowExecutionScalarRow;
    const metadata = readRecord(result.metadata);
    const storedContext: ActionOriginContext = {
      ...(typeof metadata.actorUserId === 'string'
        ? { actorUserId: metadata.actorUserId }
        : {}),
      ...(typeof metadata.apiKeyId === 'string'
        ? { apiKeyId: metadata.apiKeyId }
        : {}),
      origin: normalizeActionOrigin(metadata.origin),
    };
    const eta = composeEtaMetadata(row, readRecord(metadata.eta));
    const normalizedMetadata = withActionOriginMetadata(
      Object.keys(eta).length > 0 ? { ...metadata, eta } : metadata,
      storedContext,
    );
    const relationNodeResults = readNodeResults(row.nodeResults);
    const nodeResults =
      relationNodeResults.length > 0
        ? relationNodeResults
        : readNodeResults(result.nodeResults);
    const creditsUsed =
      readOptionalNumber(row.creditsUsed) ??
      readOptionalNumber(result.creditsUsed);
    const durationMs =
      readOptionalNumber(row.durationMs) ??
      readOptionalNumber(result.durationMs);
    const progress =
      readOptionalNumber(row.progress) ??
      readOptionalNumber(result.progress) ??
      0;
    const failedNodeId =
      readOptionalString(row.failedNodeId) ??
      readOptionalString(result.failedNodeId) ??
      null;

    return {
      ...normalized,
      creditsUsed,
      durationMs,
      failedNodeId,
      inputValues: readRecord(result.inputValues),
      metadata: normalizedMetadata,
      nodeResults,
      progress,
      result: { ...result, metadata: normalizedMetadata },
    };
  }

  async findOne(
    params: Record<string, unknown>,
    populate: PopulateOption[] = DEFAULT_EXECUTION_POPULATE,
  ): Promise<WorkflowExecutionDocument | null> {
    return await super.findOne(params, populate);
  }

  override async findAll(
    input: unknown,
    options: AggregationOptions,
    enableCache: boolean = true,
  ): Promise<AggregatePaginateResult<WorkflowExecutionDocument>> {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const findAllInput = input as PrismaFindAllInput;
      if (
        'where' in findAllInput ||
        'include' in findAllInput ||
        'orderBy' in findAllInput ||
        'select' in findAllInput
      ) {
        return await super.findAll(
          {
            ...findAllInput,
            include: {
              ...(findAllInput.include ?? {}),
              nodeResults: true,
            },
          },
          options,
          enableCache,
        );
      }
    }

    return await super.findAll(input, options, enableCache);
  }

  @HandleErrors('get execution runtime state', 'workflow-executions')
  async getRuntimeState(
    executionId: string,
  ): Promise<WorkflowExecutionRuntimeState | null> {
    // tenant-scope-ignore: delayed workflow jobs carry only the opaque globally unique execution id; this read checks isDeleted and returns no tenant-owned relation data
    const execution = (await this.prisma.workflowExecution.findUnique({
      select: {
        creditsUsed: true,
        durationMs: true,
        estimatedDurationMs: true,
        etaConfidence: true,
        etaCurrentPhase: true,
        etaUpdatedAt: true,
        failedNodeId: true,
        isDeleted: true,
        progress: true,
        remainingDurationMs: true,
        result: true,
        startedAt: true,
      },
      where: { id: executionId },
    })) as WorkflowExecutionRuntimeStateRow | null;

    if (!execution || execution.isDeleted) {
      return null;
    }

    const result = readRecord(execution.result);
    const storedMetadata = readRecord(result.metadata);
    const eta = composeEtaMetadata(execution, readRecord(storedMetadata.eta));
    const metadata = {
      ...storedMetadata,
      ...(Object.keys(eta).length > 0 ? { eta } : {}),
    };

    return {
      metadata,
      progress:
        readOptionalNumber(execution.progress) ??
        readOptionalNumber(result.progress) ??
        0,
      startedAt: execution.startedAt,
    };
  }

  /**
   * List executions currently paused at a review gate (a `pendingApproval`
   * lives in the result metadata and the run is still RUNNING). Ordered oldest
   * first so the timeout sweep sees the longest-waiting gates first. The
   * RUNNING set is dominated by paused reviews (active runs are short-lived),
   * so a bounded scan + in-memory metadata parse is both correct and cheap and
   * avoids brittle nested-JSON path operators.
   */
  @HandleErrors('list pending review-gate executions', 'workflow-executions')
  async findPendingReviewGateExecutions(
    limit = 500,
  ): Promise<PendingReviewGateExecution[]> {
    const rows = (await this.prisma.workflowExecution.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        organizationId: true,
        result: true,
        workflowId: true,
      },
      take: limit,
      where: {
        isDeleted: false,
        status: PrismaWorkflowExecutionStatus.RUNNING,
      },
    })) as Array<{
      id: string;
      organizationId: string;
      workflowId: string;
      result: unknown;
    }>;

    const pending: PendingReviewGateExecution[] = [];
    for (const row of rows) {
      const result = readRecord(row.result);
      const metadata =
        result.metadata && typeof result.metadata === 'object'
          ? (result.metadata as Record<string, unknown>)
          : undefined;
      const pendingApproval =
        metadata?.pendingApproval &&
        typeof metadata.pendingApproval === 'object'
          ? (metadata.pendingApproval as Record<string, unknown>)
          : undefined;

      const nodeId = pendingApproval?.nodeId;
      const requestedAt = pendingApproval?.requestedAt;
      if (typeof nodeId !== 'string' || typeof requestedAt !== 'string') {
        continue;
      }

      pending.push({
        autoApproveIfNoResponse:
          typeof pendingApproval?.autoApproveIfNoResponse === 'boolean'
            ? pendingApproval.autoApproveIfNoResponse
            : false,
        executionId: row.id,
        nodeId,
        organizationId: row.organizationId,
        requestedAt,
        timeoutHours:
          typeof pendingApproval?.timeoutHours === 'number'
            ? pendingApproval.timeoutHours
            : 24,
        workflowId: row.workflowId,
      });
    }

    return pending;
  }

  @HandleErrors('create execution', 'workflow-executions')
  async createExecution(
    userId: string,
    organizationId: string,
    dto: WorkflowExecutionCreateInput,
  ): Promise<WorkflowExecutionDocument> {
    const metadata = withActionOriginMetadata(dto.metadata);
    const retention = parseWorkflowExecutionRetention(metadata);
    const executionResult = {
      inputValues: dto.inputValues ?? {},
      metadata,
      nodeResults: [],
      progress: 0,
    } as Prisma.InputJsonValue;
    const data = {
      creditsUsed: 0,
      estimatedDurationMs: dto.estimatedDurationMs ?? null,
      etaConfidence: dto.etaConfidence ?? null,
      etaCurrentPhase: dto.etaCurrentPhase ?? null,
      etaUpdatedAt: dto.etaCurrentPhase ? new Date() : null,
      idempotencyKey: dto.idempotencyKey ?? null,
      organizationId,
      progress: 0,
      purgeAfterHours: retention.purgeAfterHours,
      remainingDurationMs: dto.remainingDurationMs ?? null,
      result: executionResult,
      status: PrismaWorkflowExecutionStatus.PENDING,
      scrubAllNodePayloads: retention.scrubAllNodePayloads,
      scrubNodeIds: retention.scrubNodeIds,
      totalNodes: dto.totalNodes ?? null,
      trigger: dto.trigger ?? null,
      userId,
      workflowId: dto.workflowId,
      workflowVersionId: dto.workflowVersionId,
    } satisfies Prisma.WorkflowExecutionUncheckedCreateInput;

    const result = dto.idempotencyKey
      ? await this.prisma.workflowExecution.upsert({
          create: data,
          update: {},
          where: {
            organizationId_idempotencyKey: {
              idempotencyKey: dto.idempotencyKey,
              organizationId,
            },
          },
        })
      : await this.prisma.workflowExecution.create({ data });

    return this.normalizeDocument(result);
  }

  @HandleErrors('start execution', 'workflow-executions')
  async startExecution(
    executionId: string,
  ): Promise<WorkflowExecutionDocument | null> {
    // tenant-scope-ignore: the internal workflow runner starts an execution by its opaque globally unique id and has no request-level tenant boundary
    const result = await this.prisma.workflowExecution.update({
      data: {
        completedAt: null,
        durationMs: null,
        error: null,
        failure: Prisma.DbNull,
        failureReason: null,
        failedNodeId: null,
        startedAt: new Date(),
        status: PrismaWorkflowExecutionStatus.RUNNING,
      },
      where: { id: executionId },
    });

    return this.normalizeDocument(result);
  }

  @HandleErrors('complete execution', 'workflow-executions')
  async completeExecution(
    executionId: string,
    error?: string,
    completion?: WorkflowExecutionCompletionFields,
  ): Promise<WorkflowExecutionDocument | null> {
    const completedAt = new Date();
    const failure = error ? { ...formatAgentError(error), detail: null } : null;
    // tenant-scope-ignore: internal completion callers carry the opaque globally unique execution id; this lookup resolves its tenant and the mutation below is scoped to it
    const execution = (await this.prisma.workflowExecution.findUnique({
      select: {
        estimatedDurationMs: true,
        organizationId: true,
        startedAt: true,
        trigger: true,
        userId: true,
        workflowId: true,
        workflow: { select: { label: true, metadata: true, userId: true } },
      },
      where: { id: executionId },
    })) as WorkflowExecutionCompletionRow | null;

    if (!execution) {
      return null;
    }

    const durationMs = execution.startedAt
      ? completedAt.getTime() - execution.startedAt.getTime()
      : 0;
    this.logEtaComparison(
      executionId,
      execution.workflowId,
      durationMs,
      execution.estimatedDurationMs,
    );

    const terminalTransition = await this.prisma.$transaction(
      async (transaction) => {
        const transition = await transaction.workflowExecution.updateMany({
          data: {
            completedAt,
            ...(completion?.creditsUsed !== undefined
              ? { creditsUsed: completion.creditsUsed }
              : {}),
            durationMs,
            error,
            failure: failure ?? Prisma.DbNull,
            failureReason: failure?.reason ?? null,
            etaCurrentPhase: error ? 'Failed' : 'Completed',
            etaUpdatedAt: completedAt,
            ...(completion?.failedNodeId !== undefined
              ? { failedNodeId: completion.failedNodeId }
              : {}),
            progress: 100,
            remainingDurationMs: 0,
            status: error
              ? PrismaWorkflowExecutionStatus.FAILED
              : PrismaWorkflowExecutionStatus.COMPLETED,
          },
          where: scopedWhere(execution.organizationId, {
            id: executionId,
            status: {
              in: [
                PrismaWorkflowExecutionStatus.PENDING,
                PrismaWorkflowExecutionStatus.RUNNING,
              ],
            },
          }),
        });

        if (transition.count !== 1) {
          return null;
        }

        // tenant-scope-ignore: this primary-key read follows a successful organization-scoped update in the same transaction
        const updatedExecution = await transaction.workflowExecution.findUnique(
          {
            where: { id: executionId },
          },
        );

        if (!updatedExecution) {
          throw new Error(
            `Workflow execution ${executionId} disappeared after its terminal transition`,
          );
        }

        const durableDeliveryId =
          await this.workflowNotificationOutboxService.recordWorkflowOutcome(
            transaction,
            buildWorkflowOutcomeInput(
              execution,
              executionId,
              completedAt,
              failure,
              error,
            ),
          );

        return { deliveryId: durableDeliveryId, result: updatedExecution };
      },
    );

    if (!terminalTransition) {
      return null;
    }

    const { deliveryId, result } = terminalTransition;
    await this.workflowNotificationOutboxService.enqueueAfterCommit(deliveryId);

    const document = this.normalizeDocument(result);
    const creditsUsed =
      readOptionalNumber(document.creditsUsed) ??
      readOptionalNumber(completion?.creditsUsed) ??
      0;
    const failedNodeId =
      readOptionalString(document.failedNodeId) ??
      readOptionalString(completion?.failedNodeId) ??
      null;

    // Terminal transitions funnel through here, so this is the only place an
    // outbound `workflow.execution.*` event has to be emitted from.
    await this.workflowEventWebhookService.emitExecutionOutcome({
      completedAt,
      creditsUsed,
      durationMs,
      errorMessage: error ?? null,
      executionId,
      failedNodeId,
      occurredAt: completedAt,
      organizationId: execution.organizationId ?? '',
      progress: 100,
      startedAt: execution.startedAt,
      status: error
        ? SharedWorkflowExecutionStatus.FAILED
        : SharedWorkflowExecutionStatus.COMPLETED,
      trigger: execution.trigger,
      workflowId: execution.workflowId,
    });

    return document;
  }

  private logEtaComparison(
    executionId: string,
    workflowId: string,
    durationMs: number,
    rawEstimate: unknown,
  ): void {
    const estimatedDurationMs = readOptionalNumber(rawEstimate);
    if (estimatedDurationMs === undefined) {
      return;
    }

    this.logger?.log('Workflow execution eta comparison', {
      durationDeltaMs: durationMs - estimatedDurationMs,
      estimatedDurationMs,
      executionId,
      observedDurationMs: durationMs,
      workflowId,
    });
  }

  @HandleErrors('cancel execution', 'workflow-executions')
  async cancelExecution(
    executionId: string,
  ): Promise<WorkflowExecutionDocument | null> {
    // tenant-scope-ignore: the internal workflow runner cancels an execution by its opaque globally unique id and has no request-level tenant boundary
    const existing = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
    });
    if (!existing) {
      return null;
    }

    const completedAt = new Date();
    const transition = await this.prisma.workflowExecution.updateMany({
      data: {
        completedAt,
        status: PrismaWorkflowExecutionStatus.CANCELLED,
      },
      where: {
        id: executionId,
        isDeleted: false,
        organizationId: existing.organizationId,
        status: {
          in: [
            PrismaWorkflowExecutionStatus.PENDING,
            PrismaWorkflowExecutionStatus.RUNNING,
          ],
        },
      },
    });

    if (transition.count !== 1) {
      return this.normalizeDocument(existing);
    }

    // tenant-scope-ignore: primary-key read after the non-terminal cancel transition
    const updated = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
    });
    return this.normalizeDocument(updated);
  }

  @HandleErrors('update node result', 'workflow-executions')
  async updateNodeResult(
    executionId: string,
    nodeResult: WorkflowNodeResult,
    totalNodes?: number,
  ): Promise<WorkflowExecutionProgressSnapshot | null> {
    const nodeId = nodeResult.nodeId;
    const nodeType = nodeResult.nodeType || 'unknown';
    const status = String(nodeResult.status);
    const inputJson =
      nodeResult.input === undefined ? null : JSON.stringify(nodeResult.input);
    const outputJson =
      nodeResult.output === undefined
        ? null
        : JSON.stringify(nodeResult.output);
    const error = nodeResult.error ?? null;
    const startedAt = nodeResult.startedAt ?? null;
    const completedAt = nodeResult.completedAt ?? null;
    const nodeProgress = nodeResult.progress ?? null;
    const retryCount = nodeResult.retryCount ?? null;
    const creditsUsed = nodeResult.creditsUsed ?? null;
    const useStoredNodeCount = totalNodes === undefined;
    const expectedNodeCount = totalNodes ?? 0;

    // sql-risk-audit: ignore raw-sql-review -- Primary-key-scoped child-row upsert plus scalar progress update; payload is one node, not the execution result blob.
    const [updatedExecution] = await this.prisma.$queryRaw<
      WorkflowExecutionProgressRow[]
    >`
      WITH upserted AS (
        INSERT INTO workflow_execution_node_results (
          id,
          "organizationId",
          "executionId",
          "nodeId",
          "nodeType",
          status,
          input,
          output,
          error,
          "startedAt",
          "completedAt",
          progress,
          "retryCount",
          "creditsUsed",
          "createdAt",
          "updatedAt"
        )
        SELECT
          concat('wer_', e.id, '_', ${nodeId}::text),
          e."organizationId",
          e.id,
          ${nodeId}::text,
          ${nodeType}::text,
          ${status}::text,
          ${inputJson}::jsonb,
          ${outputJson}::jsonb,
          ${error}::text,
          ${startedAt}::timestamp,
          ${completedAt}::timestamp,
          ${nodeProgress}::int,
          ${retryCount}::int,
          ${creditsUsed}::int,
          NOW(),
          NOW()
        FROM workflow_executions AS e
        WHERE e.id = ${executionId}::text
        ON CONFLICT ("executionId", "nodeId") DO UPDATE SET
          "nodeType" = EXCLUDED."nodeType",
          status = EXCLUDED.status,
          input = COALESCE(EXCLUDED.input, workflow_execution_node_results.input),
          output = COALESCE(EXCLUDED.output, workflow_execution_node_results.output),
          error = COALESCE(EXCLUDED.error, workflow_execution_node_results.error),
          "startedAt" = COALESCE(
            workflow_execution_node_results."startedAt",
            EXCLUDED."startedAt"
          ),
          "completedAt" = COALESCE(
            EXCLUDED."completedAt",
            workflow_execution_node_results."completedAt"
          ),
          progress = COALESCE(
            EXCLUDED.progress,
            workflow_execution_node_results.progress
          ),
          "retryCount" = COALESCE(
            EXCLUDED."retryCount",
            workflow_execution_node_results."retryCount"
          ),
          "creditsUsed" = COALESCE(
            EXCLUDED."creditsUsed",
            workflow_execution_node_results."creditsUsed"
          ),
          "updatedAt" = NOW()
        RETURNING "executionId"
      ),
      counted AS (
        SELECT
          upserted."executionId",
          COUNT(*) FILTER (
            WHERE node_result.status IN (
              ${SharedWorkflowExecutionStatus.COMPLETED}::text,
              ${SharedWorkflowExecutionStatus.FAILED}::text
            )
          ) AS completed_count,
          COUNT(*) AS result_count
        FROM upserted
        JOIN workflow_execution_node_results AS node_result
          ON node_result."executionId" = upserted."executionId"
        GROUP BY upserted."executionId"
      )
      UPDATE workflow_executions AS execution
      SET
        progress = CASE
          WHEN GREATEST(
            CASE
              WHEN ${useStoredNodeCount}::boolean THEN counted.result_count
              ELSE ${expectedNodeCount}::int
            END,
            COALESCE(execution."totalNodes", 0)
          ) > 0
            THEN ROUND(
              counted.completed_count::numeric * 100 / GREATEST(
                CASE
                  WHEN ${useStoredNodeCount}::boolean
                    THEN COALESCE(execution."totalNodes", counted.result_count)
                  ELSE ${expectedNodeCount}::int
                END,
                1
              )::numeric
            )::int
          ELSE 0
        END,
        "totalNodes" = COALESCE(
          execution."totalNodes",
          CASE
            WHEN ${useStoredNodeCount}::boolean THEN counted.result_count
            ELSE ${expectedNodeCount}::int
          END
        ),
        "updatedAt" = NOW()
      FROM counted
      WHERE execution.id = counted."executionId"
      RETURNING execution.id, execution.progress
    `;

    return toWorkflowExecutionProgressSnapshot(updatedExecution);
  }

  @HandleErrors('set failed node', 'workflow-executions')
  async setFailedNodeId(
    executionId: string,
    failedNodeId: string,
  ): Promise<void> {
    // tenant-scope-ignore: the internal workflow runner addresses this mutation by an opaque globally unique execution id and has no request-level tenant boundary
    await this.prisma.workflowExecution.update({
      data: { failedNodeId },
      where: { id: executionId },
    });
  }

  @HandleErrors('set credits used', 'workflow-executions')
  async setCreditsUsed(
    executionId: string,
    creditsUsed: number,
  ): Promise<void> {
    // tenant-scope-ignore: the internal workflow runner addresses this mutation by an opaque globally unique execution id and has no request-level tenant boundary
    await this.prisma.workflowExecution.update({
      data: { creditsUsed },
      where: { id: executionId },
    });
  }

  /**
   * Atomically claim the pending review gate for `nodeId`. Both the human
   * approval endpoint and the timeout sweep resolve gates through this claim:
   * the unexpired lease stops matching after one caller wins. Failed resolvers
   * release the lease, and an abandoned lease becomes retryable after expiry.
   */
  @HandleErrors('claim pending review gate', 'workflow-executions')
  async claimPendingReviewGate(
    executionId: string,
    nodeId: string,
    claimToken: string,
  ): Promise<boolean> {
    const nowMs = Date.now();
    const expiresAtMs = nowMs + REVIEW_GATE_RESOLUTION_LEASE_MS;
    const resolutionClaim = JSON.stringify({ claimToken, expiresAtMs });
    const claimed = await this.prisma.$executeRaw`
      UPDATE workflow_executions
      SET result = jsonb_set(
        result,
        '{metadata,pendingApproval,resolutionClaim}',
        ${resolutionClaim}::jsonb,
        true
      )
      WHERE id = ${executionId}
        AND status = 'RUNNING'::"WorkflowExecutionStatus"
        AND "completedAt" IS NULL
        AND result -> 'metadata' -> 'pendingApproval' ->> 'nodeId' = ${nodeId}
        AND COALESCE(
          (result -> 'metadata' -> 'pendingApproval' -> 'resolutionClaim' ->> 'expiresAtMs')::bigint,
          0
        ) <= ${nowMs}
    `;
    return claimed === 1;
  }

  @HandleErrors('complete pending review gate claim', 'workflow-executions')
  async completePendingReviewGateClaim(
    executionId: string,
    nodeId: string,
    claimToken: string,
  ): Promise<boolean> {
    const completed = await this.prisma.$executeRaw`
      UPDATE workflow_executions
      SET result = jsonb_set(result, '{metadata,pendingApproval}', 'null'::jsonb)
      WHERE id = ${executionId}
        AND result -> 'metadata' -> 'pendingApproval' ->> 'nodeId' = ${nodeId}
        AND result -> 'metadata' -> 'pendingApproval' -> 'resolutionClaim' ->> 'claimToken' = ${claimToken}
    `;
    return completed === 1;
  }

  @HandleErrors('release pending review gate claim', 'workflow-executions')
  async releasePendingReviewGateClaim(
    executionId: string,
    nodeId: string,
    claimToken: string,
  ): Promise<boolean> {
    const released = await this.prisma.$executeRaw`
      UPDATE workflow_executions
      SET result = jsonb_set(
        result,
        '{metadata,pendingApproval}',
        (result -> 'metadata' -> 'pendingApproval') - 'resolutionClaim',
        true
      )
      WHERE id = ${executionId}
        AND result -> 'metadata' -> 'pendingApproval' ->> 'nodeId' = ${nodeId}
        AND result -> 'metadata' -> 'pendingApproval' -> 'resolutionClaim' ->> 'claimToken' = ${claimToken}
    `;
    return released === 1;
  }

  @HandleErrors('update execution metadata', 'workflow-executions')
  async updateExecutionMetadata(
    executionId: string,
    metadataUpdates: Record<string, unknown>,
  ): Promise<WorkflowExecutionProgressSnapshot | null> {
    const metadataUpdatesJson = JSON.stringify(metadataUpdates);

    // sql-risk-audit: ignore raw-sql-review -- Primary-key-scoped metadata merge; returns only id/progress so status writes do not ship the result blob.
    const [updatedExecution] = await this.prisma.$queryRaw<
      WorkflowExecutionProgressRow[]
    >`
      UPDATE workflow_executions AS execution
      SET
        result = jsonb_set(
          CASE
            WHEN jsonb_typeof(execution.result) = 'object'
              THEN execution.result
            ELSE '{}'::jsonb
          END,
          '{metadata}',
          COALESCE(
            CASE
              WHEN jsonb_typeof(execution.result->'metadata') = 'object'
                THEN execution.result->'metadata'
            END,
            '{}'::jsonb
          ) || ${metadataUpdatesJson}::jsonb,
          true
        ),
        "updatedAt" = NOW()
      WHERE execution.id = ${executionId}
      RETURNING execution.id, execution.progress
    `;

    if (!updatedExecution) {
      return null;
    }

    return {
      id: updatedExecution.id,
      metadata: metadataUpdates,
      progress: updatedExecution.progress ?? 0,
    };
  }

  @HandleErrors('update execution progress', 'workflow-executions')
  async updateExecutionProgress(
    executionId: string,
    update: WorkflowExecutionProgressUpdate,
  ): Promise<WorkflowExecutionProgressSnapshot | null> {
    const eta = update.eta;
    const etaUpdatedAt = eta?.lastEtaUpdateAt
      ? new Date(eta.lastEtaUpdateAt)
      : eta
        ? new Date()
        : undefined;

    // tenant-scope-ignore: the internal workflow runner addresses this progress mutation by an opaque globally unique execution id and has no request-level tenant boundary
    const result = await this.prisma.workflowExecution.update({
      data: {
        ...(eta?.etaConfidence !== undefined
          ? { etaConfidence: eta.etaConfidence }
          : {}),
        ...(eta?.currentPhase !== undefined
          ? { etaCurrentPhase: eta.currentPhase }
          : {}),
        ...(etaUpdatedAt && !Number.isNaN(etaUpdatedAt.getTime())
          ? { etaUpdatedAt }
          : {}),
        ...(eta?.estimatedDurationMs !== undefined
          ? { estimatedDurationMs: eta.estimatedDurationMs }
          : {}),
        ...(update.progress !== undefined ? { progress: update.progress } : {}),
        ...(eta?.remainingDurationMs !== undefined
          ? { remainingDurationMs: eta.remainingDurationMs }
          : {}),
      },
      select: { id: true, progress: true },
      where: { id: executionId },
    });

    return {
      id: result.id,
      metadata: eta ? { eta } : {},
      progress: result.progress,
    };
  }

  @HandleErrors('get execution stats', 'workflow-executions')
  async getExecutionStats(
    workflowId: string,
    organizationId: string,
  ): Promise<{
    total: number;
    completed: number;
    failed: number;
    avgDurationMs: number;
  }> {
    const executions = await this.prisma.workflowExecution.findMany({
      select: { durationMs: true, status: true },
      where: scopedWhere(organizationId, { workflowId }),
    });

    const total = executions.length;
    const completed = executions.filter(
      (e) => e.status === PrismaWorkflowExecutionStatus.COMPLETED,
    ).length;
    const failed = executions.filter(
      (e) => e.status === PrismaWorkflowExecutionStatus.FAILED,
    ).length;

    const durationsWithValue = executions
      .map((e) => e.durationMs)
      .filter((d): d is number => typeof d === 'number' && d > 0);

    const avgDurationMs =
      durationsWithValue.length > 0
        ? durationsWithValue.reduce((a, b) => a + b, 0) /
          durationsWithValue.length
        : 0;

    return { avgDurationMs, completed, failed, total };
  }
}
