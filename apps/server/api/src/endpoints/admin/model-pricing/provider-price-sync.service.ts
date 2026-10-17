import {
  PLATFORM_SCHEDULE_QUEUE,
  PROVIDER_PRICE_SYNC_TASKS,
  type ProviderPriceSyncProvider,
} from '@genfeedai/contracts/queue';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

export interface QueuedProviderPriceSync {
  provider: ProviderPriceSyncProvider;
  jobId: string;
}

/**
 * Runs the provider price import once, on demand, by enqueueing the same task
 * the weekly platform schedule fires. The workers own the import; this only
 * hands them the job, so no deploy is needed to refresh prices.
 */
@Injectable()
export class ProviderPriceSyncService {
  constructor(
    @InjectQueue(PLATFORM_SCHEDULE_QUEUE)
    private readonly queue: Queue,
  ) {}

  async enqueue(
    providers: readonly ProviderPriceSyncProvider[],
  ): Promise<QueuedProviderPriceSync[]> {
    const requestedAt = Date.now();

    return Promise.all(
      providers.map(async (provider) => {
        const job = await this.queue.add(
          PROVIDER_PRICE_SYNC_TASKS[provider],
          {},
          {
            attempts: 1,
            jobId: `manual-${PROVIDER_PRICE_SYNC_TASKS[provider]}-${requestedAt}`,
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        );

        return { jobId: String(job.id), provider };
      }),
    );
  }
}
