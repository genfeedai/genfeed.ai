import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { LIFECYCLE_MAINTENANCE_IDS } from '@api/services/lifecycle-emails/lifecycle-email-maintenance-workflow';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { Injectable } from '@nestjs/common';

const HOUR_MS = 3_600_000;

@Injectable()
export class CronLifecycleEmailsService {
  constructor(private readonly queue: WorkflowExecutionQueueService) {}

  /**
   * One hourly sweep. It queues a run only for the organizations that have
   * lifecycle deliveries, recaps, credit or trial notices, or product signals
   * to process (`LifecycleEmailWorkService`).
   */
  async processLifecycleEmails(): Promise<void> {
    const canonicalId = LIFECYCLE_MAINTENANCE_IDS.SWEEP;
    await this.queue.queueSystemWorkflow(
      {
        actionType: canonicalId,
        canonicalId,
        inputValues: { request: { referenceDate: new Date().toISOString() } },
        organizationId: 'genfeed-public-tools',
        userId: 'genfeed-public-tools',
        source: 'system-email-schedule',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
      },
      `${canonicalId}-${Math.floor(Date.now() / HOUR_MS)}`,
      {
        attempts: 3,
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
      },
    );
  }
}
