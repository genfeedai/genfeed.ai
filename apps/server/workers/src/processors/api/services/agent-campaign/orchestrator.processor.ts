import { ContentEngineService } from '@api/services/agent-campaign/content-engine.service';
import { ORCHESTRATOR_RUN_QUEUE } from '@api/services/agent-campaign/orchestrator.constants';
import { OrchestratorRunJobData } from '@api/services/agent-campaign/orchestrator-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor(ORCHESTRATOR_RUN_QUEUE, {
  concurrency: 2,
  limiter: { duration: 60_000, max: 10 },
})
export class OrchestratorProcessor extends WorkerHost {
  private readonly logContext = 'OrchestratorProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly contentEngineService: ContentEngineService,
  ) {
    super();
  }

  async process(job: Job<OrchestratorRunJobData>): Promise<unknown> {
    this.logger.log(`${this.logContext} starting`, {
      campaignId: job.data.campaignId,
      jobName: job.name,
      scheduledAt: job.data.scheduledAt,
    });

    try {
      const result = await this.contentEngineService.runOrchestrationCycle(
        job.data.campaignId,
        job.data.organizationId,
      );

      this.logger.log(`${this.logContext} completed`, {
        campaignId: job.data.campaignId,
        dispatchCount: result.dispatchCount,
        nextOrchestratedAt: result.nextOrchestratedAt?.toISOString(),
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
