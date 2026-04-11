import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { HeygenPollQueueService } from '@api/queues/heygen-poll/heygen-poll-queue.service';
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
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
    @Inject(forwardRef(() => AvatarVideoGenerationService))
    private readonly avatarVideoGenerationService: AvatarVideoGenerationService,
    @Inject(forwardRef(() => HeygenPollQueueService))
    private readonly heygenPollQueueService: HeygenPollQueueService,
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
      if (data.outputType === 'facecam') {
        await this.dispatchFacecam(data);
        return;
      }

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

      await this.tasksService
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

  /**
   * Direct facecam dispatch: bypasses the agent orchestrator and calls
   * AvatarVideoGenerationService directly. The user explicitly picks
   * HeyGen avatarId + heygenVoiceId from the composer, so we pass them
   * through with useIdentity: false (so the picker choice wins over
   * brand defaults).
   *
   * After the ingredient is created (status: PROCESSING), attach it to
   * the task via TasksService.attachOutput so the workspace UI starts
   * polling for it. The polling fallback (for localhost where HeyGen
   * webhooks cannot reach) is scheduled here when GENFEEDAI_WEBHOOKS_URL
   * is not set.
   */
  private async dispatchFacecam(data: WorkspaceTaskJobData): Promise<void> {
    if (!data.request || data.request.trim().length === 0) {
      throw new Error('Facecam task requires non-empty request text (script).');
    }

    this.logger.log(
      `${this.logContext}: Dispatching facecam for task ${data.taskId}`,
      {
        heygenAvatarId: data.heygenAvatarId,
        heygenVoiceId: data.heygenVoiceId,
        taskId: data.taskId,
      },
    );

    // Mark in_progress before firing the HeyGen call so the workspace
    // activity pane shows the task moving.
    await this.tasksService.recordTaskEvent(
      data.taskId,
      data.organizationId,
      data.userId,
      {
        payload: {
          heygenAvatarId: data.heygenAvatarId,
          heygenVoiceId: data.heygenVoiceId,
        },
        type: 'task_started',
      },
      {
        chosenProvider: 'heygen',
        executionPathUsed: 'video_generation',
        progress: {
          activeRunCount: 1,
          message: 'Calling HeyGen to generate facecam video.',
          percent: 10,
          stage: 'generating',
        },
        status: 'in_progress',
      },
    );

    const result = await this.avatarVideoGenerationService.generateAvatarVideo(
      {
        aspectRatio: '9:16',
        avatarId: data.heygenAvatarId,
        heygenVoiceId: data.heygenVoiceId,
        text: data.request,
        useIdentity: false,
        voiceProvider: 'heygen',
      },
      {
        brandId: data.brandId,
        organizationId: data.organizationId,
        userId: data.userId,
      },
    );

    this.logger.log(
      `${this.logContext}: Facecam generation started for task ${data.taskId}`,
      {
        externalId: result.externalId,
        ingredientId: result.ingredientId,
        taskId: data.taskId,
      },
    );

    // Attach the ingredient to the task so the workspace UI can fetch
    // and poll it. The ingredient is in PROCESSING state; the workspace
    // will re-render when the webhook or poller flips it to COMPLETED.
    await this.tasksService.attachOutput(
      data.taskId,
      result.ingredientId,
      data.organizationId,
      data.userId,
    );

    await this.tasksService.recordTaskEvent(
      data.taskId,
      data.organizationId,
      data.userId,
      {
        payload: {
          externalId: result.externalId,
          ingredientId: result.ingredientId,
        },
        type: 'facecam_dispatched',
      },
      {
        progress: {
          activeRunCount: 1,
          message: 'Facecam video generation in progress on HeyGen.',
          percent: 35,
          stage: 'waiting_for_provider',
        },
      },
    );

    // Cloud deployments set GENFEEDAI_WEBHOOKS_URL so HeyGen can POST
    // back to /v1/webhooks/heygen/callback. Localhost / self-hosted
    // deployments don't, so we schedule a poll fallback that hits
    // HeygenAvatarProvider.getStatus until terminal.
    const webhookConfigured = Boolean(
      process.env.GENFEEDAI_WEBHOOKS_URL &&
        process.env.GENFEEDAI_WEBHOOKS_URL.length > 0,
    );

    if (!webhookConfigured) {
      this.logger.log(
        `${this.logContext}: GENFEEDAI_WEBHOOKS_URL not set, scheduling poll fallback for task ${data.taskId}`,
      );
      await this.heygenPollQueueService.schedule({
        externalId: result.externalId,
        ingredientId: result.ingredientId,
        organizationId: data.organizationId,
        taskId: data.taskId,
        userId: data.userId,
      });
    }
  }
}
