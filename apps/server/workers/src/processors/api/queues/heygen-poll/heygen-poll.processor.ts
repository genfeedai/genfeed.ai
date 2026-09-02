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

import { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowNodeContinuationCoordinatorService } from '@api/collections/workflows/services/workflow-node-continuation-coordinator.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { HeygenAvatarProvider } from '@api/services/avatar-video/providers/heygen-avatar.provider';
import {
  HEYGEN_POLL_MAX_ATTEMPTS,
  HEYGEN_POLL_QUEUE,
  HeygenPollJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor(HEYGEN_POLL_QUEUE, {
  concurrency: 5,
  limiter: { duration: 60000, max: 30 },
})
export class HeygenPollProcessor extends WorkerHost {
  private readonly logContext = 'HeygenPollProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly heygenAvatarProvider: HeygenAvatarProvider,
    private readonly webhooksService: WebhooksService,
    private readonly continuationCoordinator: WorkflowNodeContinuationCoordinatorService,
    private readonly continuations: WorkflowNodeContinuationService,
  ) {
    super();
  }

  async process(job: Job<HeygenPollJobData>): Promise<void> {
    const { data } = job;

    this.logger.log(
      `${this.logContext}: polling HeyGen continuation ${data.continuationId} (attempt ${data.attempt})`,
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
          `${this.logContext}: polling timeout for continuation ${data.continuationId}`,
          {
            attempt: data.attempt,
            externalId: data.externalId,
            ingredientId: data.ingredientId,
          },
        );
        await this.finalizeFailure(data, 'HeyGen polling timeout');
        return;
      }

      await this.continuations.requestHeygenPollAttempt({
        attempt: data.attempt + 1,
        continuationId: data.continuationId,
        externalId: data.externalId,
        organizationId: data.organizationId,
      });
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

      await this.continuationCoordinator.completeProviderAction({
        identity: {
          continuationId: data.continuationId,
          organizationId: data.organizationId,
        },
        provider: 'heygen',
        providerResult: { externalId: providerVideoId, url: videoUrl },
      });

      this.logger.log(
        `${this.logContext}: finalized success for continuation ${data.continuationId}`,
        { ingredientId: data.ingredientId, videoUrl },
      );
    } catch (error: unknown) {
      this.logger.error(
        `${this.logContext}: finalizeSuccess failed for continuation ${data.continuationId}`,
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
      await this.webhooksService.handleFailedGenerationForIngredient(
        data.ingredientId,
        errorMessage,
      );

      await this.continuationCoordinator.failProviderAction({
        error: errorMessage,
        identity: {
          continuationId: data.continuationId,
          organizationId: data.organizationId,
        },
        provider: 'heygen',
        providerResult: { externalId: data.externalId },
      });

      this.logger.error(
        `${this.logContext}: finalized failure for continuation ${data.continuationId}`,
        { error: errorMessage, ingredientId: data.ingredientId },
      );
    } catch (patchError: unknown) {
      this.logger.error(
        `${this.logContext}: finalizeFailure cleanup failed for continuation ${data.continuationId}`,
        patchError,
      );
      throw patchError;
    }
  }
}
