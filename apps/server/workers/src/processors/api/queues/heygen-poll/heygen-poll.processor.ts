/**
 * HeyGen Poll Processor
 *
 * Consumes jobs from the heygen-poll queue. Each job represents one
 * polling attempt against HeyGen's video status endpoint. On non-terminal
 * status, the processor reschedules itself with an increased attempt
 * counter. On terminal status, it calls the same downstream logic the
 * webhook path uses (`WebhooksService.processMediaForIngredient` on
 * success, metadata error patch on failure) and then broadcasts a
 * task-level event so the workspace UI refreshes.
 *
 * This path is used for localhost / self-hosted deployments where HeyGen
 * cannot reach GENFEEDAI_WEBHOOKS_URL. Cloud deployments receive the
 * completion via webhook and do not enqueue poll jobs.
 */
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import {
  HEYGEN_POLL_DELAY_MS,
  HEYGEN_POLL_MAX_ATTEMPTS,
  HEYGEN_POLL_QUEUE_NAME,
  HeygenPollJobData,
  HeygenPollQueueService,
} from '@api/queues/heygen-poll/heygen-poll-queue.service';
import { HeygenAvatarProvider } from '@api/services/avatar-video/providers/heygen-avatar.provider';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, Inject } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor(HEYGEN_POLL_QUEUE_NAME, {
  concurrency: 5,
  limiter: { duration: 60000, max: 30 },
})
export class HeygenPollProcessor extends WorkerHost {
  private readonly logContext = 'HeygenPollProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly heygenAvatarProvider: HeygenAvatarProvider,
    private readonly webhooksService: WebhooksService,
    private readonly metadataService: MetadataService,
    private readonly ingredientsService: IngredientsService,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
    @Inject(forwardRef(() => HeygenPollQueueService))
    private readonly heygenPollQueueService: HeygenPollQueueService,
  ) {
    super();
  }

  async process(job: Job<HeygenPollJobData>): Promise<void> {
    const { data } = job;

    this.logger.log(
      `${this.logContext}: polling HeyGen for task ${data.taskId} (attempt ${data.attempt})`,
      {
        externalId: data.externalId,
        ingredientId: data.ingredientId,
      },
    );

    const result = await this.heygenAvatarProvider.getStatus(
      data.externalId,
      data.organizationId,
    );

    if (result.status === 'processing' || result.status === 'queued') {
      if (data.attempt >= HEYGEN_POLL_MAX_ATTEMPTS) {
        this.logger.error(
          `${this.logContext}: polling timeout for task ${data.taskId}`,
          {
            attempt: data.attempt,
            externalId: data.externalId,
            ingredientId: data.ingredientId,
          },
        );
        await this.finalizeFailure(data, 'HeyGen polling timeout');
        return;
      }

      await this.heygenPollQueueService.schedule(
        { ...data, attempt: data.attempt + 1 },
        HEYGEN_POLL_DELAY_MS,
      );
      return;
    }

    if (result.status === 'completed' && result.videoUrl) {
      await this.finalizeSuccess(data, result.videoUrl, result.jobId);
      return;
    }

    // Terminal failure
    await this.finalizeFailure(
      data,
      result.error ?? 'HeyGen generation failed without error message',
    );
  }

  private async finalizeSuccess(
    data: HeygenPollJobData,
    videoUrl: string,
    providerVideoId: string,
  ): Promise<void> {
    try {
      await this.webhooksService.processMediaForIngredient(
        data.ingredientId,
        'avatar',
        videoUrl,
        providerVideoId,
      );

      await this.tasksService.recordTaskEvent(
        data.taskId,
        data.organizationId,
        data.userId,
        {
          payload: {
            ingredientId: data.ingredientId,
            videoUrl,
          },
          type: 'facecam_completed',
        },
        {
          progress: {
            activeRunCount: 0,
            message: 'Facecam video ready.',
            percent: 100,
            stage: 'completed',
          },
          status: 'done',
        },
      );

      this.logger.log(
        `${this.logContext}: finalized success for task ${data.taskId}`,
        { ingredientId: data.ingredientId, videoUrl },
      );
    } catch (error: unknown) {
      this.logger.error(
        `${this.logContext}: finalizeSuccess failed for task ${data.taskId}`,
        error,
      );
      throw error;
    }
  }

  private async finalizeFailure(
    data: HeygenPollJobData,
    errorMessage: string,
  ): Promise<void> {
    try {
      const ingredient = await this.ingredientsService.findOne({
        _id: data.ingredientId,
        isDeleted: false,
      });
      if (ingredient?.metadata) {
        await this.metadataService.patch(String(ingredient.metadata), {
          error: errorMessage,
        });
      }

      await this.tasksService.recordTaskEvent(
        data.taskId,
        data.organizationId,
        data.userId,
        {
          payload: {
            error: errorMessage,
            ingredientId: data.ingredientId,
          },
          type: 'facecam_failed',
        },
        {
          failureReason: errorMessage,
          progress: {
            activeRunCount: 0,
            message: errorMessage,
            percent: 100,
            stage: 'failed',
          },
          status: 'failed',
        },
      );

      this.logger.error(
        `${this.logContext}: finalized failure for task ${data.taskId}`,
        { error: errorMessage, ingredientId: data.ingredientId },
      );
    } catch (patchError: unknown) {
      this.logger.error(
        `${this.logContext}: finalizeFailure cleanup failed for task ${data.taskId}`,
        patchError,
      );
    }
  }
}
