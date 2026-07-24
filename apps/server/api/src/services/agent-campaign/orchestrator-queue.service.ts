import { DEFAULT_ORCHESTRATION_INTERVAL_HOURS } from '@api/services/agent-campaign/orchestrator.constants';
import {
  ORCHESTRATOR_RUN_QUEUE,
  OrchestratorRunJobData,
} from '@genfeedai/queue-contracts';
import { reserveIdempotentJob } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

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
    const reservation = await reserveIdempotentJob(
      this.orchestratorQueue,
      jobId,
    );
    if (reservation.alreadyQueued) {
      this.logger.warn(`${this.logContext} campaign already queued`, {
        campaignId: data.campaignId,
        jobId,
        state: reservation.state,
      });
      return jobId;
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
