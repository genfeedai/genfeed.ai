import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const MS_PER_HOUR = 60 * 60 * 1000;
const REVIEW_GATE_TIMEOUT_SCHEDULE = '*/15 * * * *';

@Injectable()
export class CronReviewGateTimeoutService {
  private readonly context = 'CronReviewGateTimeoutService';

  constructor(
    private readonly logger: LoggerService,
    private readonly executionsService: WorkflowExecutionsService,
    private readonly executorService: WorkflowExecutorService,
    private readonly systemWorkflowProvenanceService: SystemWorkflowProvenanceService,
  ) {}

  /**
   * Auto-resolves review gates whose reviewer timeout has elapsed. Fired every
   * 15 minutes by the system-sweeps BullMQ Job Scheduler. Each resolution is
   * recorded as a system workflow execution for tenant-visible provenance.
   */
  async resolveTimedOutReviewGates(): Promise<void> {
    const pending =
      await this.executionsService.findPendingReviewGateExecutions();
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
        const { result } = await this.systemWorkflowProvenanceService.runAction(
          {
            actionType: 'review-gate-timeout',
            canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.REVIEW_GATE_TIMEOUT,
            description:
              'Auto-resolves review gates whose reviewer timeout elapsed.',
            inputValues: {
              autoApproveIfNoResponse: gate.autoApproveIfNoResponse,
              executionId: gate.executionId,
              nodeId: gate.nodeId,
            },
            label: 'Review Gate Timeout Resolution',
            organizationId: gate.organizationId,
            schedule: REVIEW_GATE_TIMEOUT_SCHEDULE,
            source: 'CronReviewGateTimeoutService.resolveTimedOutReviewGates',
            trigger: WorkflowExecutionTrigger.SCHEDULED,
          },
          () =>
            this.executorService.resolveTimedOutReviewGate(
              gate.workflowId,
              gate.executionId,
              gate.organizationId,
              gate.nodeId,
            ),
        );

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
