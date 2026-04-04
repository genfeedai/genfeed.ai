import { TelegramDistributionService } from '@api/services/distribution/telegram/telegram-distribution.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@api/shared/utils/circuit-breaker/circuit-breaker.util';
import { DistributionPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

export interface TelegramDistributeJobData {
  distributionId: string;
  organizationId: string;
  platform: DistributionPlatform;
}

@Processor('telegram-distribute')
export class TelegramDistributeProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly telegramDistributionService: TelegramDistributionService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'telegram-distribute',
      this.logger,
    );
  }

  async process(job: Job<TelegramDistributeJobData>): Promise<void> {
    try {
      await this.circuitBreaker.execute(() => this.processInternal(job));
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn((error as Error).message);
        throw error;
      }
      throw error;
    }
  }

  private async processInternal(
    job: Job<TelegramDistributeJobData>,
  ): Promise<void> {
    const { distributionId, organizationId, platform } = job.data;

    this.logger.log(`Processing telegram distribution id=${distributionId}`);

    await job.updateProgress(10);

    await this.telegramDistributionService.processScheduled({
      distributionId,
      organizationId,
      platform,
    });

    await job.updateProgress(100);

    this.logger.log(`Telegram distribution completed id=${distributionId}`);
  }
}
