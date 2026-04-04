import type { WorkflowExecutionJobData } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  WORKFLOW_EXECUTION_QUEUE,
  WorkflowExecutionQueueService,
} from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { DelayResumeJobData } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

/**
 * BullMQ processor for workflow execution jobs.
 *
 * Handles:
 * - `trigger` jobs: delegates to WorkflowExecutorService.handleTriggerEvent
 * - `delay-resume` jobs: delegates to WorkflowExecutorService.resumeAfterDelay
 *
 * When a workflow execution encounters a delay node, the executor returns
 * delay metadata. This processor detects it and schedules a new delayed job
 * via WorkflowExecutionQueueService.
 */
@Processor(WORKFLOW_EXECUTION_QUEUE, {
  concurrency: 5,
  limiter: { duration: 60000, max: 20 },
})
export class WorkflowExecutionProcessor extends WorkerHost {
  private readonly logContext = 'WorkflowExecutionProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly executorService: WorkflowExecutorService,
    private readonly queueService: WorkflowExecutionQueueService,
  ) {
    super();
  }

  async process(job: Job<WorkflowExecutionJobData>): Promise<unknown> {
    const { data } = job;

    this.logger.log(`${this.logContext} processing job`, {
      jobId: job.id,
      jobName: job.name,
      type: data.type,
    });

    try {
      switch (data.type) {
        case 'trigger':
          return await this.processTrigger(job);

        case 'delay-resume':
          return await this.processDelayResume(job);

        default:
          throw new Error(`Unknown workflow execution job type: ${data.type}`);
      }
    } catch (error: unknown) {
      this.logger.error(`${this.logContext} job failed`, error, {
        jobId: job.id,
        type: data.type,
      });
      throw error;
    }
  }

  /**
   * Process a trigger event: find matching workflows and execute them.
   * If any execution pauses for a delay, schedule the resume job.
   */
  private async processTrigger(
    job: Job<WorkflowExecutionJobData>,
  ): Promise<unknown> {
    const { triggerEvent } = job.data;
    if (!triggerEvent) {
      throw new Error('Trigger job missing triggerEvent data');
    }

    const results = await this.executorService.handleTriggerEvent(triggerEvent);

    // Check for delay pauses — schedule resume jobs
    for (const result of results) {
      // The executor attaches _delayJobData when execution pauses at a delay node
      const delayData = (result as unknown as Record<string, unknown>)
        ._delayJobData as DelayResumeJobData | undefined;

      if (delayData) {
        const delayMs = this.calculateDelayMs(delayData);
        await this.queueService.queueDelayedResume(delayData, delayMs);

        this.logger.log(
          `${this.logContext} scheduled delay resume for workflow ${delayData.workflowId}`,
          {
            delayMs,
            executionId: delayData.executionId,
          },
        );
      }
    }

    this.logger.log(`${this.logContext} trigger processed`, {
      executionCount: results.length,
      jobId: job.id,
      triggerType: triggerEvent.type,
    });

    return {
      executionCount: results.length,
      results: results.map((r) => ({
        executionId: r.executionId,
        status: r.status,
        workflowId: r.workflowId,
      })),
    };
  }

  /**
   * Process a delay resume: continue workflow execution from where it paused.
   */
  private async processDelayResume(
    job: Job<WorkflowExecutionJobData>,
  ): Promise<unknown> {
    const { delayResumeData } = job.data;
    if (!delayResumeData) {
      throw new Error('Delay resume job missing delayResumeData');
    }

    const result = await this.executorService.resumeAfterDelay(delayResumeData);

    this.logger.log(`${this.logContext} delay resume completed`, {
      executionId: result.executionId,
      jobId: job.id,
      status: result.status,
      workflowId: result.workflowId,
    });

    return {
      executionId: result.executionId,
      status: result.status,
      workflowId: result.workflowId,
    };
  }

  /**
   * Calculate delay in ms from the delay job data.
   * Reads the resumeAt from the delay node's output in the cache.
   */
  private calculateDelayMs(data: DelayResumeJobData): number {
    const cache = data.nodeOutputCache;
    const delayNodeOutput = cache[data.delayNodeId] as
      | Record<string, unknown>
      | undefined;

    if (delayNodeOutput && typeof delayNodeOutput.delayMs === 'number') {
      return Math.max(0, delayNodeOutput.delayMs);
    }

    if (delayNodeOutput && typeof delayNodeOutput.resumeAt === 'string') {
      const resumeAt = new Date(delayNodeOutput.resumeAt);
      const now = new Date();
      return Math.max(0, resumeAt.getTime() - now.getTime());
    }

    // Default: no delay (execute immediately)
    return 0;
  }
}
