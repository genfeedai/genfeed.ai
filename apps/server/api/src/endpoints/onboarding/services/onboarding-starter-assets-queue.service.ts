import type { OnboardingStarterAssetsJobData } from '@genfeedai/contracts/queue';
import { ONBOARDING_STARTER_ASSETS_QUEUE } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

/**
 * Producer for `ONBOARDING_STARTER_ASSETS_QUEUE`. The domain loading step
 * calls this to kick off the starter post + ad draft in the background —
 * generation runs in the workers app (`OnboardingStarterAssetsProcessor`), so
 * the HTTP request returns immediately and never blocks entering the app.
 */
@Injectable()
export class OnboardingStarterAssetsQueueService {
  private readonly context = {
    service: OnboardingStarterAssetsQueueService.name,
  };

  constructor(
    @InjectQueue(ONBOARDING_STARTER_ASSETS_QUEUE)
    private readonly queue: Queue<OnboardingStarterAssetsJobData>,
    private readonly logger: LoggerService,
  ) {}

  async enqueue(data: OnboardingStarterAssetsJobData): Promise<void> {
    await this.queue.add('generate-starter-assets', data, {
      attempts: 2,
      backoff: { delay: 3000, type: 'exponential' },
      // One live job per brand — a repeat trigger (e.g. a retried onboarding
      // step) replaces rather than duplicates the draft post + ad.
      jobId: `onboarding-starter-assets-${data.brandId}`,
      removeOnComplete: true,
      removeOnFail: true,
    });

    this.logger.debug('Queued onboarding starter assets', {
      ...this.context,
      brandId: data.brandId,
    });
  }
}
