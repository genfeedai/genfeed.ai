import {
  CAMPAIGN_MEMORY_EXTRACTION_QUEUE,
  DEFAULT_ORCHESTRATION_INTERVAL_HOURS,
} from '@api/services/agent-campaign/orchestrator.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface CampaignMemoryExtractionJobData {
  campaignId: string;
  organizationId: string;
  scheduledAt: string;
  userId: string;
}

@Injectable()
export class CampaignMemoryQueueService {
  private readonly logContext = 'CampaignMemoryQueueService';

  constructor(
    @InjectQueue(CAMPAIGN_MEMORY_EXTRACTION_QUEUE)
    private readonly campaignMemoryQueue: Queue<CampaignMemoryExtractionJobData>,
    private readonly logger: LoggerService,
  ) {}

  async queueExtraction(data: {
    campaignId: string;
    organizationId: string;
    userId: string;
    scheduledAt?: Date;
  }): Promise<string> {
    const jobId = `campaign-memory-${data.campaignId}`;
    const existingJob = await this.campaignMemoryQueue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();
      if (['active', 'waiting', 'delayed'].includes(state)) {
        this.logger.warn(
          `${this.logContext} campaign extraction already queued`,
          {
            campaignId: data.campaignId,
            jobId,
            state,
          },
        );
        return jobId;
      }

      await existingJob.remove();
    }

    const scheduledAt = data.scheduledAt ?? new Date();
    const job = await this.campaignMemoryQueue.add(
      'extract-campaign-memory',
      {
        campaignId: data.campaignId,
        organizationId: data.organizationId,
        scheduledAt: scheduledAt.toISOString(),
        userId: data.userId,
      } satisfies CampaignMemoryExtractionJobData,
      {
        attempts: 3,
        backoff: {
          delay: DEFAULT_ORCHESTRATION_INTERVAL_HOURS >= 24 ? 10_000 : 5_000,
          type: 'exponential',
        },
        jobId,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    this.logger.log(`${this.logContext} queued winner extraction`, {
      campaignId: data.campaignId,
      jobId: job.id,
      organizationId: data.organizationId,
    });

    return job.id!;
  }
}
