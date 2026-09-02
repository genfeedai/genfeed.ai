import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowNodeClaimService } from '@api/collections/workflows/services/workflow-node-claim.service';
import {
  type ProviderContinuationIdentity,
  WorkflowNodeContinuationService,
} from '@api/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkflowNodeContinuationCoordinatorService {
  private readonly logContext = 'WorkflowNodeContinuationCoordinatorService';

  constructor(
    private readonly continuations: WorkflowNodeContinuationService,
    private readonly nodeClaims: WorkflowNodeClaimService,
    private readonly executions: WorkflowExecutionsService,
    private readonly workflowExecutor: WorkflowExecutorService,
    private readonly logger: LoggerService,
  ) {}

  async completeProviderAction(input: {
    identity: ProviderContinuationIdentity;
    provider: string;
    providerResult?: Record<string, unknown>;
  }): Promise<'duplicate' | 'queued'> {
    const recorded = await this.continuations.recordProviderSettlement({
      identity: input.identity,
      provider: input.provider,
      providerResult: input.providerResult,
      succeeded: true,
    });
    return recorded === 'recorded' ? 'queued' : 'duplicate';
  }

  async failProviderAction(input: {
    error: string;
    identity: ProviderContinuationIdentity;
    provider: string;
    providerResult?: Record<string, unknown>;
  }): Promise<'duplicate' | 'queued'> {
    const recorded = await this.continuations.recordProviderSettlement({
      error: input.error,
      identity: input.identity,
      provider: input.provider,
      providerResult: input.providerResult,
      succeeded: false,
    });
    return recorded === 'recorded' ? 'queued' : 'duplicate';
  }

  async reconcileProviderContinuations(): Promise<{
    failed: number;
    pollsDispatched: number;
    resumed: number;
  }> {
    const pollsDispatched =
      await this.continuations.reconcileHeygenPollTransport();
    const candidates = await this.continuations.findReconciliationCandidates();
    let failed = 0;
    let resumed = 0;
    for (const candidate of candidates) {
      try {
        const settlement = await this.continuations.claimProviderSettlement({
          ...(candidate.error ? { error: candidate.error } : {}),
          identity: {
            continuationId: candidate.continuationId,
            organizationId: candidate.organizationId,
          },
          provider: candidate.provider,
          providerResult: candidate.providerResult,
          succeeded: candidate.succeeded,
        });
        if (settlement.kind !== 'claimed') {
          continue;
        }
        if (candidate.succeeded) {
          await this.resumeClaimedSuccess(settlement);
          resumed += 1;
        } else {
          await this.finalizeClaimedFailure(settlement);
          failed += 1;
        }
      } catch (error: unknown) {
        this.logger.error(
          `${this.logContext} failed to reconcile continuation`,
          error,
          {
            continuationId: candidate.continuationId,
            organizationId: candidate.organizationId,
          },
        );
      }
    }
    return { failed, pollsDispatched, resumed };
  }

  private async resumeClaimedSuccess(
    settlement: Extract<
      Awaited<
        ReturnType<WorkflowNodeContinuationService['claimProviderSettlement']>
      >,
      { kind: 'claimed' }
    >,
  ): Promise<void> {
    await this.nodeClaims.complete({
      executionId: settlement.executionId,
      nodeId: settlement.nodeId,
      organizationId: settlement.organizationId,
      output: settlement.finalOutput,
      status: 'completed',
    });
    await this.executions.updateNodeResult(settlement.executionId, {
      completedAt: new Date(),
      creditsUsed: settlement.creditsUsed,
      nodeId: settlement.nodeId,
      nodeType: settlement.actionId,
      output: settlement.finalOutput as Record<string, unknown>,
      progress: 100,
      retryCount: 0,
      status: WorkflowExecutionStatus.COMPLETED,
    });

    try {
      await this.workflowExecutor.continueProviderCallbackExecution({
        executionId: settlement.executionId,
        organizationId: settlement.organizationId,
        workflowVersionId: settlement.workflowVersionId,
      });
    } catch (error: unknown) {
      this.logger.error(
        `${this.logContext} failed to resume continuation`,
        error,
        {
          continuationId: settlement.continuationId,
          executionId: settlement.executionId,
        },
      );
      throw error;
    }

    await this.continuations.markSettlementFinished({
      continuationId: settlement.continuationId,
      organizationId: settlement.organizationId,
      succeeded: true,
    });
  }

  private async finalizeClaimedFailure(
    settlement: Extract<
      Awaited<
        ReturnType<WorkflowNodeContinuationService['claimProviderSettlement']>
      >,
      { kind: 'claimed' }
    >,
  ): Promise<void> {
    await this.nodeClaims.complete({
      error: settlement.error,
      executionId: settlement.executionId,
      nodeId: settlement.nodeId,
      organizationId: settlement.organizationId,
      output: settlement.finalOutput,
      status: 'failed',
    });
    await this.executions.updateNodeResult(settlement.executionId, {
      completedAt: new Date(),
      creditsUsed: settlement.creditsUsed,
      error: settlement.error,
      nodeId: settlement.nodeId,
      nodeType: settlement.actionId,
      ...(settlement.finalOutput === undefined
        ? {}
        : {
            output: settlement.finalOutput as Record<string, unknown>,
          }),
      progress: 100,
      retryCount: 0,
      status: WorkflowExecutionStatus.FAILED,
    });
    await this.workflowExecutor.continueProviderCallbackExecution({
      executionId: settlement.executionId,
      organizationId: settlement.organizationId,
      workflowVersionId: settlement.workflowVersionId,
    });
    await this.continuations.markSettlementFinished({
      continuationId: settlement.continuationId,
      organizationId: settlement.organizationId,
      succeeded: false,
    });
  }
}
