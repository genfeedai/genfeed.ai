import { MediaModerationService } from '@api/services/moderation/media-moderation.service';
import {
  MEDIA_MODERATION_QUEUE,
  type MediaModerationJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

/** Consumer for `MEDIA_MODERATION_QUEUE` (#4880). */
@Processor(MEDIA_MODERATION_QUEUE, { concurrency: 2 })
export class MediaModerationProcessor extends WorkerHost {
  constructor(
    private readonly mediaModerationService: MediaModerationService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<MediaModerationJobData>): Promise<void> {
    const outcome = await this.mediaModerationService.moderate(job.data);
    this.logger.log('MediaModerationProcessor finished', {
      ingredientId: job.data.ingredientId,
      outcome,
    });
  }
}
