import type { CampaignMemoryExtractionJobData } from '@api/services/agent-campaign/campaign-memory-queue.service';
import { ContentEngineService } from '@api/services/agent-campaign/content-engine.service';
import { CAMPAIGN_MEMORY_EXTRACTION_QUEUE } from '@api/services/agent-campaign/orchestrator.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor(CAMPAIGN_MEMORY_EXTRACTION_QUEUE, {
  concurrency: 2,
  limiter: { duration: 60_000, max: 10 },
})
export class CampaignMemoryProcessor extends WorkerHost {
  private readonly logContext = 'CampaignMemoryProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly contentEngineService: ContentEngineService,
  ) {
    super();
  }

  async process(job: Job<CampaignMemoryExtractionJobData>): Promise<unknown> {
    this.logger.log(`${this.logContext} starting`, {
      campaignId: job.data.campaignId,
      jobName: job.name,
      scheduledAt: job.data.scheduledAt,
    });

    try {
      const result = await this.contentEngineService.extractWinnerPatterns(
        job.data.campaignId,
        job.data.organizationId,
      );

      this.logger.log(`${this.logContext} completed`, {
        campaignId: job.data.campaignId,
        extractedCount: result.extractedCount,
        memoryId: result.memoryId,
        skippedReason: result.skippedReason,
      });

      return result;
    } catch (error: unknown) {
      this.logger.error(`${this.logContext} failed`, error, {
        campaignId: job.data.campaignId,
      });
      throw error;
    }
  }
}
