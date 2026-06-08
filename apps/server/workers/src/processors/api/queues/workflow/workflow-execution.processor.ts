/**
 * Workflow Execution Processor
 *
 * BullMQ worker that processes workflow execution and delay-resume jobs.
 */
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import type {
  WorkflowDelayJobData,
  WorkflowExecutionJobData,
} from '@api/queues/workflow/workflow-queue.service';
import { WorkflowQueueService } from '@api/queues/workflow/workflow-queue.service';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, Inject } from '@nestjs/common';
import { Job } from 'bullmq';

type WorkflowExecutionResult = Awaited<
  ReturnType<WorkflowEngineAdapterService['executeWorkflow']>
>;

@Processor('workflow-execution', {
  concurrency: 3,
  limiter: { duration: 60000, max: 10 },
})
export class WorkflowExecutionProcessor extends WorkerHost {
  private readonly logContext = 'WorkflowExecutionProcessor';

  constructor(
    private readonly logger: LoggerService,
    @Inject(forwardRef(() => WorkflowsService))
    private readonly workflowsService: WorkflowsService,
    private readonly executionsService: WorkflowExecutionsService,
    private readonly engineAdapter: WorkflowEngineAdapterService,
    @Inject(forwardRef(() => WorkflowQueueService))
    private readonly queueService: WorkflowQueueService,
  ) {
    super();
  }

  async process(job: Job<WorkflowExecutionJobData>): Promise<void> {
    const { data } = job;
    const url = `${this.logContext} process`;

    this.logger.log(`${url} starting`, {
      executionId: data.executionId,
      jobName: job.name,
      trigger: data.trigger,
      workflowId: data.workflowId,
    });

    try {
      // Mark execution as running
      await this.executionsService.startExecution(data.executionId);

      // Load workflow definition
      const workflow = await this.workflowsService.findOne({
        _id: data.workflowId,
      });

      if (!workflow) {
        throw new Error(`Workflow ${data.workflowId} not found`);
      }

      // Convert to executable format
      const executable =
        this.engineAdapter.convertToExecutableWorkflow(workflow);

      // Execute
      const options = data.resumeFromNodeId
        ? { resumeFromNodeId: data.resumeFromNodeId }
        : {};

      const resultRef: {
        current?: WorkflowExecutionResult;
      } = {};
      const result = await this.engineAdapter.executeWorkflow(executable, {
        ...options,
        onNodeStatusChange: async (event) => {
          // Check if a delay node completed — schedule delayed resume
          const nodeResult = resultRef.current?.nodeResults?.get(event.nodeId);
          if (
            event.newStatus === 'completed' &&
            nodeResult?.output &&
            typeof nodeResult.output === 'object' &&
            'delayMs' in (nodeResult.output as Record<string, unknown>)
          ) {
            const delayOutput = nodeResult.output as {
              delayMs: number;
              resumeAt: string;
            };
            if (delayOutput.delayMs > 0) {
              await this.queueService.queueDelayedResume(
                {
                  delayNodeId: event.nodeId,
                  executionId: data.executionId,
                  organizationId: data.organizationId,
                  resumeAt: delayOutput.resumeAt,
                  scheduledAt: new Date().toISOString(),
                  userId: data.userId,
                  workflowId: data.workflowId,
                },
                delayOutput.delayMs,
              );
            }
          }

          // Update node result in execution record
          await this.executionsService.updateNodeResult(
            data.executionId,
            {
              completedAt: event.timestamp,
              nodeId: event.nodeId,
              nodeType:
                executable.nodes.find((n) => n.id === event.nodeId)?.type ??
                'unknown',
              output: event.output as Record<string, unknown>,
              progress: event.newStatus === 'completed' ? 100 : 0,
              startedAt: event.timestamp,
              status:
                event.newStatus === 'completed'
                  ? WorkflowExecutionStatus.COMPLETED
                  : event.newStatus === 'failed'
                    ? WorkflowExecutionStatus.FAILED
                    : WorkflowExecutionStatus.RUNNING,
            },
            executable.nodes.length,
          );
        },
      });
      resultRef.current = result;

      // Mark execution complete
      await this.executionsService.completeExecution(
        data.executionId,
        result.error,
      );

      this.logger.log(`${url} completed`, {
        executionId: data.executionId,
        status: result.status,
        workflowId: data.workflowId,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`${url} failed`, error);

      await this.executionsService.completeExecution(
        data.executionId,
        errorMessage,
      );

      throw error; // Let BullMQ handle retry
    }
  }
}

@Processor('workflow-delay', {
  concurrency: 5,
})
export class WorkflowDelayProcessor extends WorkerHost {
  private readonly logContext = 'WorkflowDelayProcessor';

  constructor(
    private readonly logger: LoggerService,
    @Inject(forwardRef(() => WorkflowQueueService))
    private readonly queueService: WorkflowQueueService,
    private readonly executionsService: WorkflowExecutionsService,
  ) {
    super();
  }

  async process(job: Job<WorkflowDelayJobData>): Promise<void> {
    const { data } = job;
    const url = `${this.logContext} process`;

    this.logger.log(`${url} delay completed, resuming workflow`, {
      delayNodeId: data.delayNodeId,
      executionId: data.executionId,
      workflowId: data.workflowId,
    });

    // Check execution is still valid (not cancelled)
    const execution = await this.executionsService.findOne({
      _id: data.executionId,
    });

    if (!execution) {
      this.logger.warn(`${url} execution not found, skipping resume`, {
        executionId: data.executionId,
      });
      return;
    }

    const executionStatus = String(execution.status);

    if (
      executionStatus === WorkflowExecutionStatus.CANCELLED ||
      executionStatus === WorkflowExecutionStatus.FAILED ||
      executionStatus === WorkflowExecutionStatus.COMPLETED
    ) {
      this.logger.warn(
        `${url} execution already ${executionStatus}, skipping delayed resume`,
        {
          executionId: data.executionId,
        },
      );
      return;
    }

    // Re-queue execution as a resume
    await this.queueService.queueExecution({
      executionId: data.executionId,
      inputValues: {},
      organizationId: data.organizationId,
      resumeFromNodeId: data.delayNodeId,
      trigger: 'resume',
      userId: data.userId,
      workflowId: data.workflowId,
    });
  }
}
