import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { WorkflowExecutorService } from '@server/collections/workflows/services/workflow-executor.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';

const MS_PER_HOUR = 60 * 60 * 1000;
@Injectable()
export class CronReviewGateTimeoutService implements OnModuleInit {
  private readonly context = 'CronReviewGateTimeoutService';

  constructor(
    private readonly logger: LoggerService,
    private readonly executorService: WorkflowExecutorService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      SYSTEM_WORKFLOW_ACTION_IDS.REVIEW_GATE_TIMEOUT,
      ({ input }) =>
        this.executorService.resolveTimedOutReviewGate(
          String(input.workflowId ?? ''),
          String(input.executionId ?? ''),
          String(input.organizationId ?? ''),
          String(input.nodeId ?? ''),
        ),
    );
  }

  /**
   * Auto-resolves review gates whose reviewer timeout has elapsed. Fired every
   * 15 minutes by the system-sweeps BullMQ Job Scheduler. Each resolution is
   * recorded as a system workflow execution for tenant-visible provenance.
   */
  async resolveTimedOutReviewGates(): Promise<void> {
    const pending =
      await this.executorService.findPendingReviewGateExecutions();
    const now = Date.now();

    const totals = { approved: 0, checked: pending.length, rejected: 0 };

    for (const gate of pending) {
      const requestedAtMs = new Date(gate.requestedAt).getTime();
      if (!Number.isFinite(requestedAtMs)) {
        continue;
      }

      const deadlineMs = requestedAtMs + gate.timeoutHours * MS_PER_HOUR;
      if (deadlineMs > now) {
        continue;
      }

      try {
        const { result } = await this.systemWorkflowRunner.runAction<{
          resolution?: string;
        } | null>({
          actionType: 'review-gate-timeout',
          canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.REVIEW_GATE_TIMEOUT,
          inputValues: {
            autoApproveIfNoResponse: gate.autoApproveIfNoResponse,
            executionId: gate.executionId,
            nodeId: gate.nodeId,
            organizationId: gate.organizationId,
            workflowId: gate.workflowId,
          },
          organizationId: gate.organizationId,
          source: 'CronReviewGateTimeoutService.resolveTimedOutReviewGates',
          trigger: WorkflowExecutionTrigger.SCHEDULED,
        });

        if (result?.resolution === 'approved') {
          totals.approved += 1;
        } else if (result?.resolution === 'rejected') {
          totals.rejected += 1;
        }
      } catch (error: unknown) {
        this.logger.error(
          'Review-gate timeout resolution failed for execution',
          {
            error: (error as Error)?.message,
            executionId: gate.executionId,
            nodeId: gate.nodeId,
          },
        );
      }
    }

    this.logger.log('CronReviewGateTimeoutService completed', {
      ...totals,
      context: this.context,
    });
  }
}
