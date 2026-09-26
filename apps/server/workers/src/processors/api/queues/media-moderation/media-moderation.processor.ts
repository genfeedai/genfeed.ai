import { MediaVisionEvaluationService } from '@api/services/media-assessment/media-vision-evaluation.service';
import { MediaModerationService } from '@api/services/moderation/media-moderation.service';
import {
  MEDIA_MODERATION_QUEUE,
  type MediaModerationJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

/**
 * Consumer for `MEDIA_MODERATION_QUEUE`: runs the media gates that follow
 * perception — moderation (#4880) and vision-evaluation flags (#4881). Each
 * gate is idempotent, so a retried job only redoes what did not persist.
 */
@Processor(MEDIA_MODERATION_QUEUE, { concurrency: 2 })
export class MediaModerationProcessor extends WorkerHost {
  constructor(
    private readonly mediaModerationService: MediaModerationService,
    private readonly mediaVisionEvaluationService: MediaVisionEvaluationService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<MediaModerationJobData>): Promise<void> {
    // Each gate runs even when another throws, so one provider outage never
    // starves the others; the first failure still fails the job for retry.
    const failures: unknown[] = [];
    const run = async <T>(gate: () => Promise<T>): Promise<T | 'error'> => {
      try {
        return await gate();
      } catch (error: unknown) {
        failures.push(error);
        return 'error';
      }
    };
    const outcome = await run(() =>
      this.mediaModerationService.moderate(job.data),
    );
    const visionOutcome = await run(() =>
      this.mediaVisionEvaluationService.evaluate(job.data),
    );
    this.logger.log('MediaModerationProcessor finished', {
      ingredientId: job.data.ingredientId,
      outcome,
      visionOutcome,
    });
    if (failures.length > 0) {
      throw failures[0];
    }
  }
}
