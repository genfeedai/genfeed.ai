import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import {
  SOCIAL_INBOX_SYNC_QUEUE,
  SocialInboxSyncJobData,
  SocialInboxSyncResult,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor(SOCIAL_INBOX_SYNC_QUEUE)
export class SocialInboxSyncProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly socialInboxService: SocialInboxService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'social-inbox-sync',
      this.logger,
    );
  }

  async process(
    job: Job<SocialInboxSyncJobData>,
  ): Promise<SocialInboxSyncResult> {
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
    job: Job<SocialInboxSyncJobData>,
  ): Promise<SocialInboxSyncResult> {
    const { organizationId, brandId, userId, credentialId, limit } = job.data;

    this.logger.log(
      `Processing YouTube inbox sync for org=${organizationId}${brandId ? ` brand=${brandId}` : ''}`,
    );

    await job.updateProgress(10);

    const result = await this.socialInboxService.ingestYoutubeComments(
      { brandId, organizationId, userId },
      { credentialId, limit },
    );

    await job.updateProgress(100);

    this.logger.log(
      `YouTube inbox sync completed for org=${organizationId}: conversations=${result.conversationsCreated}, messages=${result.messagesCreated}`,
    );

    return result;
  }
}
