import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { ConfigService } from '@api/config/config.service';
import { HeygenPollQueueService } from '@api/queues/heygen-poll/heygen-poll-queue.service';
import { TaskOrchestratorService } from '@api/services/task-orchestration/task-orchestrator.service';
import { WorkspaceTaskJobData } from '@api/services/task-orchestration/workspace-task-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, HttpException, Inject } from '@nestjs/common';
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
    private readonly configService: ConfigService,
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
   * AvatarVideoGenerationService directly.
   *
   * Voice resolution uses a generic voiceId + voiceProvider pattern:
   * - voiceProvider === 'heygen' → voiceId is a HeyGen catalog voice,
   *   passed as heygenVoiceId directly.
   * - voiceProvider === 'elevenlabs' | 'genfeed-ai' | 'hedra' → voiceId
   *   is a Voice document _id, passed as clonedVoiceId so the
   *   service looks it up and routes through resolveVoiceDocument.
   *
   * When avatar or voice is absent, useIdentity flips to true so
   * brand/org identity defaults are consulted as a fallback.
   */
  private async dispatchFacecam(data: WorkspaceTaskJobData): Promise<void> {
    if (!data.request || data.request.trim().length === 0) {
      throw new Error('Facecam task requires non-empty request text (script).');
    }

    const hasExplicitAvatar = Boolean(data.heygenAvatarId);
    const hasExplicitVoice = Boolean(data.voiceId);
    const useIdentity = !hasExplicitAvatar || !hasExplicitVoice;

    // Map generic voiceId + voiceProvider to service-specific fields.
    // HeyGen catalog voices go through heygenVoiceId directly.
    // All other providers use clonedVoiceId (DB lookup + provider routing).
    const voiceParams: Record<string, string> = {};
    if (data.voiceId && data.voiceProvider) {
      if (data.voiceProvider === 'heygen') {
        voiceParams.heygenVoiceId = data.voiceId;
      } else {
        voiceParams.clonedVoiceId = data.voiceId;
        voiceParams.voiceProvider = data.voiceProvider;
      }
    }

    this.logger.log(
      `${this.logContext}: Dispatching facecam for task ${data.taskId}`,
      {
        heygenAvatarId: data.heygenAvatarId,
        taskId: data.taskId,
        useIdentity,
        voiceId: data.voiceId,
        voiceProvider: data.voiceProvider,
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
          useIdentity,
          voiceId: data.voiceId,
          voiceProvider: data.voiceProvider,
        },
        type: 'task_started',
      },
      {
        chosenProvider: data.voiceProvider || 'heygen',
        executionPathUsed: 'video_generation',
        progress: {
          activeRunCount: 1,
          message: 'Generating facecam video.',
          percent: 10,
          stage: 'generating',
        },
        status: 'in_progress',
      },
    );

    try {
      const result =
        await this.avatarVideoGenerationService.generateAvatarVideo(
          {
            aspectRatio: '9:16',
            ...(hasExplicitAvatar && { avatarId: data.heygenAvatarId }),
            ...voiceParams,
            text: data.request,
            useIdentity,
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
            message: 'Facecam video generation in progress.',
            percent: 35,
            stage: 'waiting_for_provider',
          },
        },
      );

      // Cloud deployments set GENFEEDAI_WEBHOOKS_URL so HeyGen can POST
      // back to /v1/webhooks/heygen/callback. Localhost / self-hosted
      // deployments don't, so we schedule a poll fallback that hits
      // HeygenAvatarProvider.getStatus until terminal.
      const webhooksUrl = this.configService.get('GENFEEDAI_WEBHOOKS_URL');
      const webhookConfigured = Boolean(webhooksUrl && webhooksUrl.length > 0);

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
    } catch (error: unknown) {
      const errorDetail =
        error instanceof HttpException
          ? ((error.getResponse() as { detail?: string })?.detail ??
            error.message)
          : error instanceof Error
            ? error.message
            : String(error);

      this.logger.error(
        `${this.logContext}: Facecam generation failed for task ${data.taskId}`,
        error,
      );

      await this.tasksService
        .recordTaskEvent(
          data.taskId,
          data.organizationId,
          data.userId,
          {
            payload: { error: errorDetail },
            type: 'task_failed',
          },
          {
            failureReason: errorDetail,
            progress: {
              activeRunCount: 0,
              message: errorDetail,
              percent: 100,
              stage: 'failed',
            },
            status: 'failed',
          },
        )
        .catch((patchError: unknown) => {
          this.logger.error(
            `${this.logContext}: Failed to record facecam failure event`,
            patchError,
          );
        });

      throw error;
    }
  }
}
