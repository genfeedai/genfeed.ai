import { MediaDerivativePreparationService } from '@api/services/media-urls/media-derivative-preparation.service';
import type { MediaDeliveryJobData } from '@genfeedai/contracts/interfaces';
import { MEDIA_DELIVERY_QUEUE } from '@genfeedai/contracts/queue';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor(MEDIA_DELIVERY_QUEUE, { concurrency: 1 })
export class MediaDeliveryProcessor extends WorkerHost {
  constructor(private readonly preparation: MediaDerivativePreparationService) {
    super();
  }

  async process(job: Job<MediaDeliveryJobData>): Promise<void> {
    await this.preparation.process(job.data);
  }
}
