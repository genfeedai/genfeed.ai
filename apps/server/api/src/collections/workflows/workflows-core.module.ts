import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { SYSTEM_WORKFLOW_RUNNER } from '@api/collections/workflows/workflows.tokens';
import { WORKFLOW_EXECUTION_QUEUE } from '@genfeedai/contracts/queue';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

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
    SYSTEM_WORKFLOW_RUNNER,
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
    // Consumers that only dispatch system workflows inject the token; providing
    // it here keeps them on this one-way core instead of WorkflowsModule.
    {
      provide: SYSTEM_WORKFLOW_RUNNER,
      useExisting: SystemWorkflowRunnerService,
    },
    WorkflowExecutionQueueService,
    WorkflowsService,
  ],
})
export class WorkflowsCoreModule {}
