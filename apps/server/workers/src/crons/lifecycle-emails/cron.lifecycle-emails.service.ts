import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { LIFECYCLE_MAINTENANCE_IDS } from '@api/services/lifecycle-emails/lifecycle-email-maintenance-workflow';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CronLifecycleEmailsService {
  constructor(private readonly queue: WorkflowExecutionQueueService) {}

  async processLifecycleEmails(): Promise<void> {
    const referenceDate = new Date().toISOString();
    const period = Math.floor(Date.now() / 300_000);
    for (const canonicalId of [
      LIFECYCLE_MAINTENANCE_IDS.SWEEP,
      'email-product-signals.reconcile',
    ]) {
      await this.queue.queueSystemWorkflow(
        {
          actionType: canonicalId,
          canonicalId,
          inputValues: { request: { referenceDate } },
          organizationId: 'genfeed-public-tools',
          userId: 'genfeed-public-tools',
          source: 'system-email-schedule',
          trigger: WorkflowExecutionTrigger.SCHEDULED,
        },
        `${canonicalId}-${period}`,
        { attempts: 3, replaceTerminalJob: true },
      );
    }
  }
}
