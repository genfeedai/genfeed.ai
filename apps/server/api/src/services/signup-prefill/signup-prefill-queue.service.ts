import {
  SIGNUP_PREFILL_QUEUE,
  type SignupPrefillJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

@Injectable()
export class SignupPrefillQueueService {
  private readonly context = { service: SignupPrefillQueueService.name };

  constructor(
    @InjectQueue(SIGNUP_PREFILL_QUEUE)
    private readonly queue: Queue<SignupPrefillJobData>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Schedule the one-and-only brand prefill for a freshly provisioned user.
   *
   * The job id is derived from the user id alone, so a retried signup hook or a
   * duplicated Better Auth event collapses onto the same job instead of
   * scraping and analyzing the brand twice.
   */
  async enqueuePrefill(data: SignupPrefillJobData): Promise<void> {
    const jobId = `signup-prefill:${data.userId}`;

    await this.queue.add('prefill-brand', data, {
      jobId,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log('Signup prefill job enqueued', {
      ...this.context,
      brandId: data.brandId,
      hasBrandDomain: Boolean(data.brandDomain),
      jobId,
      organizationId: data.organizationId,
      userId: data.userId,
    });
  }
}
