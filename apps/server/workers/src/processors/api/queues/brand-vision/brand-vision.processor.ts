import { BrandValidationReceiptService } from '@api/services/brand-validation/brand-validation-receipt.service';
import {
  BRAND_VISION_QUEUE,
  type BrandVisionJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

/**
 * Consumer for `BRAND_VISION_QUEUE` (#6727). Reads the pixels of one branded visual with the
 * vision models, whose predictions wait minutes for a cold start, and revalidates its receipt.
 * Never on a request path. Each prediction is bounded and its spend recorded by the provider;
 * a reading that cannot complete is recorded as an unavailable check, so the job only throws
 * when the receipt itself cannot be read or written.
 */
@Processor(BRAND_VISION_QUEUE, { concurrency: 2 })
export class BrandVisionProcessor extends WorkerHost {
  constructor(
    private readonly validation: BrandValidationReceiptService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<BrandVisionJobData>): Promise<void> {
    const { actorId, brandId, organizationId, receiptId } = job.data;
    const result = await this.validation.completeVisionChecks(
      { actorId, brandId, organizationId },
      receiptId,
    );
    this.logger.log('BrandVisionProcessor finished', {
      outcome:
        result === null
          ? 'skipped'
          : result.replayed
            ? 'replayed'
            : 'revalidated',
      receiptId,
      state: result?.receipt.state,
    });
  }
}
