import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  resolveNestedActionOrigin,
  runWithActionOrigin,
  sanitizeActionOriginContext,
  scopedWhere,
} from '@api/index';
import { BatchAlreadyOwnedException } from '@api/services/batch-generation/batch-already-owned.exception';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import type { BatchConfig } from '@api/services/batch-generation/batch-generation.types';
import { BatchGenerationCreditsService } from '@api/services/batch-generation/batch-generation-credits.service';
import { BatchGenerationStreamService } from '@api/services/batch-generation/batch-generation-stream.service';
import {
  BATCH_GENERATION_ACTION_IDS,
  buildBatchGenerationWorkflowDefinition,
} from '@api/services/batch-generation/batch-generation-workflow-definition';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActionOrigin } from '@genfeedai/contracts';
import type { BatchGenerationWorkflowInput } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

export function batchGenerationJobId(batchId: string): string {
  return `batch-generation-${batchId}`;
}

@Injectable()
export class BatchGenerationWorkflowService implements OnModuleInit {
  private readonly logContext = 'BatchGenerationWorkflowService';

  constructor(
    private readonly batches: BatchGenerationService,
    private readonly credits: BatchGenerationCreditsService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly streams: BatchGenerationStreamService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      BATCH_GENERATION_ACTION_IDS.MARK_QUEUED,
      ({ input }) =>
        this.markQueued(input.request as BatchGenerationWorkflowInput),
    );
    this.runner.registerAction(
      BATCH_GENERATION_ACTION_IDS.PROCESS,
      ({ input }) =>
        this.process(input.request as BatchGenerationWorkflowInput),
    );
    this.runner.registerAction(
      BATCH_GENERATION_ACTION_IDS.SETTLE,
      ({ input }) => this.settle(input.request as BatchGenerationWorkflowInput),
    );
    this.runner.registerWorkflow(buildBatchGenerationWorkflowDefinition());
  }

  queueBatch(request: BatchGenerationWorkflowInput): Promise<string> {
    const definition = buildBatchGenerationWorkflowDefinition();
    const actionContext = sanitizeActionOriginContext(
      request.actionContext ?? resolveNestedActionOrigin(ActionOrigin.AGENT),
    );
    return runWithActionOrigin(actionContext, () =>
      this.queue.queueSystemWorkflow(
        {
          actionType: definition.canonicalId,
          canonicalId: definition.canonicalId,
          inputValues: { request: { ...request, actionContext } },
          organizationId: request.organizationId,
          source: 'batch-generation',
          userId: request.userId,
        },
        batchGenerationJobId(request.batchId),
        { attempts: 1, replaceTerminalJob: true },
      ),
    );
  }

  private async markQueued(
    request: BatchGenerationWorkflowInput,
  ): Promise<{ queued: boolean }> {
    const batch = await this.prisma.batch.findFirst({
      select: { config: true },
      where: scopedWhere(request.organizationId, { id: request.batchId }),
    });
    if (!batch) return { queued: false };
    const config = (batch.config ?? {}) as BatchConfig;
    const queuedConfig: BatchConfig = {
      ...config,
      queuedAt: new Date().toISOString(),
    };
    await this.prisma.batch.updateMany({
      data: { config: queuedConfig as Prisma.InputJsonValue },
      where: scopedWhere(request.organizationId, { id: request.batchId }),
    });
    return { queued: true };
  }

  private async process(
    request: BatchGenerationWorkflowInput,
  ): Promise<Record<string, unknown>> {
    const streamOptions =
      request.threadId && request.userId
        ? this.streams.buildProcessOptions({
            batchId: request.batchId,
            runId: request.runId,
            threadId: request.threadId,
            userId: request.userId,
          })
        : undefined;
    try {
      const summary = await runWithActionOrigin(
        request.actionContext ?? { origin: ActionOrigin.AGENT },
        () =>
          this.batches.processBatch(
            request.batchId,
            request.organizationId,
            streamOptions,
          ),
      );
      return { ...summary, ownedElsewhere: false };
    } catch (error: unknown) {
      if (error instanceof BatchAlreadyOwnedException) {
        this.logger.warn(`${this.logContext} batch already owned`, {
          batchId: request.batchId,
        });
        return { ownedElsewhere: true };
      }
      throw error;
    }
  }

  private async settle(
    request: BatchGenerationWorkflowInput,
  ): Promise<{ settled: boolean }> {
    try {
      await this.credits.settleBatchCredits({
        batchId: request.batchId,
        organizationId: request.organizationId,
        userId: request.userId,
      });
      return { settled: true };
    } catch (error: unknown) {
      this.logger.error(`${this.logContext} settlement failed`, error, {
        batchId: request.batchId,
      });
      return { settled: false };
    }
  }
}
