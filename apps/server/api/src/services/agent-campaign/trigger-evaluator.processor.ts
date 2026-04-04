import { TRIGGER_EVALUATION_QUEUE } from '@api/services/agent-campaign/orchestrator.constants';
import { TriggerEvaluatorService } from '@api/services/agent-campaign/trigger-evaluator.service';
import { type TriggerEvaluationJobData } from '@api/services/agent-campaign/trigger-evaluator-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor(TRIGGER_EVALUATION_QUEUE, {
  concurrency: 2,
  limiter: { duration: 60_000, max: 10 },
})
export class TriggerEvaluatorProcessor extends WorkerHost {
  private readonly logContext = 'TriggerEvaluatorProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly triggerEvaluatorService: TriggerEvaluatorService,
  ) {
    super();
  }

  async process(job: Job<TriggerEvaluationJobData>): Promise<unknown> {
    this.logger.log(`${this.logContext} starting`, {
      campaignId: job.data.campaignId,
      jobName: job.name,
      scheduledAt: job.data.scheduledAt,
    });

    try {
      const result = await this.triggerEvaluatorService.evaluateCampaign(
        job.data.campaignId,
        job.data.organizationId,
      );

      this.logger.log(`${this.logContext} completed`, {
        campaignId: job.data.campaignId,
        dispatchCount: result.dispatchCount,
        triggerTypes: result.dispatchedTriggerTypes,
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
