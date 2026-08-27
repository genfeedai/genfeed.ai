import { SocialReplyCampaignDispatchService } from '@server/collections/social-inbox/services/social-reply-campaign-dispatch.service';
import {
  SOCIAL_REPLY_CAMPAIGN_QUEUE,
  SocialReplyCampaignJobData,
  SocialReplyCampaignJobResult,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

/**
 * One job dispatches at most one recipient and enqueues its own successor, so
 * a campaign's pacing never holds a worker slot open between sends.
 */
@Processor(SOCIAL_REPLY_CAMPAIGN_QUEUE)
export class SocialReplyCampaignProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly dispatchService: SocialReplyCampaignDispatchService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'social-reply-campaign',
      this.logger,
    );
  }

  async process(
    job: Job<SocialReplyCampaignJobData>,
  ): Promise<SocialReplyCampaignJobResult> {
    try {
      return await this.circuitBreaker.execute(() => this.processInternal(job));
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn(error.message);
        throw error;
      }
      throw error;
    }
  }

  private async processInternal(
    job: Job<SocialReplyCampaignJobData>,
  ): Promise<SocialReplyCampaignJobResult> {
    const { campaignId, organizationId } = job.data;

    this.logger.log(
      `Dispatching reply campaign ${campaignId} for org=${organizationId}`,
    );

    await job.updateProgress(10);

    const result = await this.dispatchService.dispatchTick(job.data);

    await job.updateProgress(100);

    this.logger.log(
      `Reply campaign ${campaignId} tick finished: outcome=${result.outcome}`,
    );

    return result;
  }
}
