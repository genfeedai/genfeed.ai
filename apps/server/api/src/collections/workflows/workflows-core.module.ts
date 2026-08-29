import { WORKFLOW_EXECUTION_QUEUE } from '@genfeedai/queue-contracts';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowsService } from '@server/collections/workflows/services/workflows.service';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';

/**
 * Workflow persistence plus the two leaves most non-workflow consumers need:
 * the system-workflow runner and its execution queue. Both resolve the
 * heavier executor/engine-adapter services lazily via `ModuleRef` rather than
 * constructor injection, so they carry no import edge back into
 * `WorkflowsModule` and are safe for `SocialInboxModule`, `ReplyBotModule`,
 * `TwitterPipelineModule`, and `CampaignModule` to import one-way.
 * Run/marketplace HTTP and the executor/adapter wiring stay on
 * `WorkflowsModule`.
 */
@Module({
  exports: [
    SystemWorkflowRunnerService,
    WorkflowExecutionQueueService,
    WorkflowsService,
  ],
  imports: [
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 5000, type: 'exponential' },
        removeOnComplete: 200,
        removeOnFail: 100,
      },
      name: WORKFLOW_EXECUTION_QUEUE,
    }),
  ],
  providers: [
    SystemWorkflowRunnerService,
    WorkflowExecutionQueueService,
    WorkflowsService,
  ],
})
export class WorkflowsCoreModule {}
