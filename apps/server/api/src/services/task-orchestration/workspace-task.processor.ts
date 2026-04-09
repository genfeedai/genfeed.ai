import { WorkspaceTasksService } from '@api/collections/workspace-tasks/services/workspace-tasks.service';
import { TaskOrchestratorService } from '@api/services/task-orchestration/task-orchestrator.service';
import { WorkspaceTaskJobData } from '@api/services/task-orchestration/workspace-task-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, Inject } from '@nestjs/common';
import { Job } from 'bullmq';

/**
 * BullMQ processor for workspace tasks.
 * Receives enqueued tasks and drives them through the orchestration pipeline.
 */
@Processor('workspace-task', {
  concurrency: 5,
  limiter: { duration: 60000, max: 30 },
})
export class WorkspaceTaskProcessor extends WorkerHost {
  private readonly logContext = 'WorkspaceTaskProcessor';

  constructor(
    private readonly logger: LoggerService,
    @Inject(forwardRef(() => TaskOrchestratorService))
    private readonly taskOrchestratorService: TaskOrchestratorService,
    @Inject(forwardRef(() => WorkspaceTasksService))
    private readonly workspaceTasksService: WorkspaceTasksService,
  ) {
    super();
  }

  async process(job: Job<WorkspaceTaskJobData>): Promise<void> {
    const { data } = job;

    this.logger.log(`${this.logContext}: Processing task ${data.taskId}`, {
      organizationId: data.organizationId,
      taskId: data.taskId,
    });

    try {
      await this.taskOrchestratorService.orchestrate({
        brandId: data.brandId,
        brandName: data.brandName,
        organizationId: data.organizationId,
        outputType: data.outputType,
        platforms: data.platforms,
        request: data.request,
        taskId: data.taskId,
        userId: data.userId,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `${this.logContext}: Task ${data.taskId} failed`,
        error,
      );

      await this.workspaceTasksService
        .recordTaskEvent(
          data.taskId,
          data.organizationId,
          data.userId,
          {
            payload: { error: errorMessage },
            type: 'task_failed',
          },
          {
            failureReason: errorMessage,
            progress: {
              activeRunCount: 0,
              message: 'Task orchestration failed before execution.',
              percent: 100,
              stage: 'failed',
            },
            status: 'failed',
          },
        )
        .catch((patchError: unknown) => {
          this.logger.error(
            `${this.logContext}: Failed to update task status`,
            patchError,
          );
        });

      throw error; // Let BullMQ handle retry
    }
  }
}
