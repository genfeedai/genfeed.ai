import {
  BRAND_VISION_QUEUE,
  type BrandVisionJobData,
} from '@genfeedai/contracts/queue';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

/**
 * How long a job that failed keeps its id. Short on purpose: the receipt stays
 * `unknown` while it waits, and a later validation may offer it again.
 */
const FAILED_JOB_RETENTION_SECONDS = 60 * 60;

/** One live job per receipt: the id deduplicates a replayed validation. */
export function brandVisionJobId(receiptId: string): string {
  return `brand-vision-${receiptId}`;
}

/**
 * Producer for `BRAND_VISION_QUEUE` (#6727). A branded visual is validated at
 * once with its OCR and placement checks pending; this queue hands the receipt to
 * a worker that reads the pixels with a cold-start-tolerant vision model and
 * revalidates the receipt. A job runs once: a failure leaves the checks unknown
 * rather than paying a second reading.
 */
@Injectable()
export class BrandVisionQueueService {
  constructor(
    @InjectQueue(BRAND_VISION_QUEUE)
    private readonly queue: Queue<BrandVisionJobData>,
  ) {}

  async enqueue(data: BrandVisionJobData): Promise<void> {
    await this.queue.add('analyze', data, {
      attempts: 1,
      jobId: brandVisionJobId(data.receiptId),
      removeOnComplete: true,
      removeOnFail: { age: FAILED_JOB_RETENTION_SECONDS },
    });
  }
}
