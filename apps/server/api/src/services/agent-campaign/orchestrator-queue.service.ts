import {
  DEFAULT_ORCHESTRATION_INTERVAL_HOURS,
  ORCHESTRATOR_RUN_QUEUE,
} from '@api/services/agent-campaign/orchestrator.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface OrchestratorRunJobData {
  campaignId: string;
  organizationId: string;
  scheduledAt: string;
  userId: string;
}

@Injectable()
export class OrchestratorQueueService {
  private readonly logContext = 'OrchestratorQueueService';

  constructor(
    @InjectQueue(ORCHESTRATOR_RUN_QUEUE)
    private readonly orchestratorQueue: Queue<OrchestratorRunJobData>,
    private readonly logger: LoggerService,
  ) {}

  async queueCampaignRun(data: {
    campaignId: string;
    organizationId: string;
    userId: string;
    scheduledAt?: Date;
  }): Promise<string> {
    const jobId = `orchestrator-run-${data.campaignId}`;
    const existingJob = await this.orchestratorQueue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();
      if (['active', 'waiting', 'delayed'].includes(state)) {
        this.logger.warn(`${this.logContext} campaign already queued`, {
          campaignId: data.campaignId,
          jobId,
          state,
        });
        return jobId;
      }

      await existingJob.remove();
    }

    const scheduledAt = data.scheduledAt ?? new Date();
    const job = await this.orchestratorQueue.add(
      'run-campaign-orchestrator',
      {
        campaignId: data.campaignId,
        organizationId: data.organizationId,
        scheduledAt: scheduledAt.toISOString(),
        userId: data.userId,
      } satisfies OrchestratorRunJobData,
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

    this.logger.log(`${this.logContext} queued campaign orchestrator`, {
      campaignId: data.campaignId,
      jobId: job.id,
      organizationId: data.organizationId,
    });

    return job.id!;
  }
}
