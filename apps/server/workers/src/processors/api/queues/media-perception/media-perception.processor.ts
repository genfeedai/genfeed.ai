import { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import {
  MEDIA_PERCEPTION_QUEUE,
  type MediaPerceptionJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

/**
 * Consumer for `MEDIA_PERCEPTION_QUEUE` (#4879). Perception runs here, never
 * on a publish request.
 */
@Processor(MEDIA_PERCEPTION_QUEUE, { concurrency: 2 })
export class MediaPerceptionProcessor extends WorkerHost {
  constructor(
    private readonly mediaPerceptionService: MediaPerceptionService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<MediaPerceptionJobData>): Promise<void> {
    const outcome = await this.mediaPerceptionService.process(job.data);
    this.logger.log('MediaPerceptionProcessor finished', {
      ingredientId: job.data.ingredientId,
      outcome,
      reason: job.data.reason,
    });
  }
}
