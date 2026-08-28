import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { WORKFLOW_ARTIFACT_ACTION_IDS } from '@server/collections/workflows/services/workflow-artifact-lifecycle.service';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import { WORKFLOW_EXECUTION_RETENTION_METADATA_KEY } from '@server/collections/workflows/workflow-execution-retention.contract';

const WORKFLOW_HOUSEKEEPING_PRINCIPAL_ID = 'genfeed-public-tools';

@Injectable()
export class CronWorkflowArtifactsService {
  private readonly context = 'CronWorkflowArtifactsService';

  constructor(
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly logger: LoggerService,
  ) {}

  async queueExpiredArtifactCleanup(now = new Date()): Promise<void> {
    const hourlyBucket = Math.floor(now.getTime() / (60 * 60 * 1000));
    const jobId = await this.workflowQueue.queueSystemAction(
      {
        actionType: WORKFLOW_ARTIFACT_ACTION_IDS.CLEANUP_EXPIRED,
        canonicalId: WORKFLOW_ARTIFACT_ACTION_IDS.CLEANUP_EXPIRED,
        inputValues: {},
        metadata: {
          [WORKFLOW_EXECUTION_RETENTION_METADATA_KEY]: {
            purgeAfterHours: 1,
            scrubNodePayloads: 'all',
          },
        },
        organizationId: WORKFLOW_HOUSEKEEPING_PRINCIPAL_ID,
        source: 'workflow_artifact_cleanup_sweep',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: WORKFLOW_HOUSEKEEPING_PRINCIPAL_ID,
      },
      `${WORKFLOW_ARTIFACT_ACTION_IDS.CLEANUP_EXPIRED}-${hourlyBucket}`,
    );

    this.logger.log('Queued workflow artifact cleanup workflow', {
      context: this.context,
      jobId,
    });
  }
}
