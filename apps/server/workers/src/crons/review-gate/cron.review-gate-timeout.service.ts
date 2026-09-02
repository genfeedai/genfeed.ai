import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  buildReviewGateTimeoutResolveDefinition,
  buildReviewGateTimeoutSweepDefinition,
  REVIEW_GATE_TIMEOUT_ACTION_IDS,
} from '@workers/crons/review-gate/review-gate-timeout-workflow-definition';

const MS_PER_HOUR = 60 * 60 * 1000;
const REVIEW_GATE_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const SYSTEM_MAINTENANCE_PRINCIPAL_ID = 'genfeed-public-tools';

type ReviewGateTimeoutRequest = {
  executionId: string;
  nodeId: string;
  organizationId: string;
  workflowId: string;
};

@Injectable()
export class CronReviewGateTimeoutService implements OnModuleInit {
  constructor(
    private readonly executorService: WorkflowExecutorService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      REVIEW_GATE_TIMEOUT_ACTION_IDS.DISCOVER,
      async () => {
        const now = Date.now();
        const pending =
          await this.executorService.findPendingReviewGateExecutions();
        return {
          items: pending.flatMap((gate) => {
            const requestedAtMs = new Date(gate.requestedAt).getTime();
            if (
              !Number.isFinite(requestedAtMs) ||
              requestedAtMs + gate.timeoutHours * MS_PER_HOUR > now
            ) {
              return [];
            }
            return [
              {
                executionId: gate.executionId,
                nodeId: gate.nodeId,
                organizationId: gate.organizationId,
                workflowId: gate.workflowId,
              } satisfies ReviewGateTimeoutRequest,
            ];
          }),
        };
      },
    );
    this.systemWorkflowRunner.registerAction(
      REVIEW_GATE_TIMEOUT_ACTION_IDS.RESOLVE,
      ({ input }) => {
        const request = input.request as ReviewGateTimeoutRequest;
        return this.executorService.resolveTimedOutReviewGate(
          request.workflowId,
          request.executionId,
          request.organizationId,
          request.nodeId,
        );
      },
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildReviewGateTimeoutSweepDefinition(),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildReviewGateTimeoutResolveDefinition(),
    );
  }

  /**
   * Auto-resolves review gates whose reviewer timeout has elapsed. Fired every
   * 15 minutes by the platform BullMQ schedule. Each resolution is
   * recorded as a system workflow execution for tenant-visible provenance.
   */
  async resolveTimedOutReviewGates(): Promise<void> {
    const now = Date.now();
    const definition = buildReviewGateTimeoutSweepDefinition();
    await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request: { requestedAt: new Date(now).toISOString() } },
        organizationId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
        source: 'review_gate_timeout_sweep',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
      },
      `review-gate-timeout-sweep-${Math.floor(now / REVIEW_GATE_SWEEP_INTERVAL_MS)}`,
      { attempts: 3, replaceTerminalJob: true },
    );
  }
}
