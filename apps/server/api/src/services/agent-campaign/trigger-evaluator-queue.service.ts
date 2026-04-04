import {
  DEFAULT_TRIGGER_EVALUATION_INTERVAL_MINUTES,
  TRIGGER_EVALUATION_QUEUE,
} from '@api/services/agent-campaign/orchestrator.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export type TriggerEvaluationJobData = {
  campaignId: string;
  organizationId: string;
  scheduledAt: string;
  userId: string;
};

@Injectable()
export class TriggerEvaluatorQueueService {
  private readonly logContext = 'TriggerEvaluatorQueueService';

  constructor(
    @InjectQueue(TRIGGER_EVALUATION_QUEUE)
    private readonly triggerEvaluationQueue: Queue<TriggerEvaluationJobData>,
    private readonly logger: LoggerService,
  ) {}

  async queueCampaignEvaluation(data: {
    campaignId: string;
    organizationId: string;
    userId: string;
    scheduledAt?: Date;
  }): Promise<string> {
    const jobId = `trigger-evaluation-${data.campaignId}`;
    const existingJob = await this.triggerEvaluationQueue.getJob(jobId);

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
    const job = await this.triggerEvaluationQueue.add(
      'evaluate-campaign-triggers',
      {
        campaignId: data.campaignId,
        organizationId: data.organizationId,
        scheduledAt: scheduledAt.toISOString(),
        userId: data.userId,
      } satisfies TriggerEvaluationJobData,
      {
        attempts: 3,
        backoff: {
          delay:
            DEFAULT_TRIGGER_EVALUATION_INTERVAL_MINUTES >= 15 ? 5_000 : 2_000,
          type: 'exponential',
        },
        jobId,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    this.logger.log(`${this.logContext} queued campaign trigger evaluation`, {
      campaignId: data.campaignId,
      jobId: job.id,
      organizationId: data.organizationId,
    });

    return job.id!;
  }
}
