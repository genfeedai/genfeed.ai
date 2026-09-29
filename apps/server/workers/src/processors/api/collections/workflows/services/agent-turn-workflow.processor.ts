import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { AGENT_TURN_QUEUE } from '@genfeedai/contracts/queue';
import { withLongJobWorkerOptions } from '@libs/jobs/bullmq-worker-lock.options';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { WorkflowExecutionProcessor } from '@workers/processors/api/collections/workflows/services/workflow-execution.processor';

/**
 * Dedicated worker for live agent-conversation turns (`agent.turn.execute`,
 * `agent.thread.ui-action`, `agent.thread.input-response`) on
 * `AGENT_TURN_QUEUE` (#5622).
 *
 * These shared `WORKFLOW_EXECUTION_QUEUE` — `concurrency: 5`, 20 jobs/minute
 * for the whole queue — with everything else interactive. A ~110k-job legacy
 * backlog there, drained at that limiter, left every new turn waiting days.
 * This queue has no rate limiter: the 20/min cap protects nothing a live turn
 * needs, and the real capacity bound for a turn is its concurrency slot.
 *
 * Extends `WorkflowExecutionProcessor` to reuse its `system-run` handling
 * verbatim, like `PlatformSystemWorkflowProcessor` and
 * `BackgroundSystemWorkflowProcessor`.
 */
@Injectable()
@Processor(AGENT_TURN_QUEUE, withLongJobWorkerOptions({ concurrency: 8 }))
export class AgentTurnWorkflowProcessor extends WorkflowExecutionProcessor {
  // Shadows the base `logContext` so log lines from this worker are
  // attributable to it — see `PlatformSystemWorkflowProcessor`.
  protected readonly logContext = 'AgentTurnWorkflowProcessor';

  constructor(
    logger: LoggerService,
    executorService: WorkflowExecutorService,
    queueService: WorkflowExecutionQueueService,
    schedulerService: WorkflowSchedulerService,
    systemWorkflowRunner: SystemWorkflowRunnerService,
  ) {
    super(
      logger,
      executorService,
      queueService,
      schedulerService,
      systemWorkflowRunner,
    );
  }
}
