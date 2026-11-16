import { WORKFLOW_ARTIFACT_ACTION_IDS } from '@api/collections/workflows/services/workflow-artifact-lifecycle.service';
import { buildWorkflowArtifactCleanupSweepDefinition } from '@api/collections/workflows/services/workflow-artifact-workflow-definition';
import { WorkflowExecutionPurgeService } from '@api/collections/workflows/services/workflow-execution-purge.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { sweepExpiryMs } from '@workers/scheduling/sweep-expiry.util';

const WORKFLOW_HOUSEKEEPING_PRINCIPAL_ID = 'genfeed-public-tools';

@Injectable()
export class CronWorkflowArtifactsService {
  private readonly context = 'CronWorkflowArtifactsService';

  constructor(
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly logger: LoggerService,
    private readonly executionPurge: WorkflowExecutionPurgeService,
  ) {}

  /** Bulk-deletes finished runs past their `purgeAt` (#10382). */
  async purgeExpiredExecutions(): Promise<void> {
    await this.executionPurge.purgeExpiredExecutions();
  }

  async queueExpiredArtifactCleanup(now = new Date()): Promise<void> {
    const hourlyBucket = Math.floor(now.getTime() / (60 * 60 * 1000));
    const definition = buildWorkflowArtifactCleanupSweepDefinition(
      WORKFLOW_ARTIFACT_ACTION_IDS.DISCOVER_EXPIRED,
    );
    const jobId = await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request: { requestedAt: now.toISOString() } },
        organizationId: WORKFLOW_HOUSEKEEPING_PRINCIPAL_ID,
        source: 'workflow_artifact_cleanup_sweep',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: WORKFLOW_HOUSEKEEPING_PRINCIPAL_ID,
      },
      `workflow-artifact-cleanup-sweep-${hourlyBucket}`,
      {
        attempts: 3,
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
        expireAfterMs: sweepExpiryMs(60 * 60 * 1000),
      },
    );

    this.logger.log('Queued workflow artifact cleanup workflow', {
      context: this.context,
      jobId,
    });
  }
}
