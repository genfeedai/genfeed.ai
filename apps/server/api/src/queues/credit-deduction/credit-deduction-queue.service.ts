import type { CreditDeductionJobData } from '@api/queues/credit-deduction/credit-deduction-job.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class CreditDeductionQueueService {
  private readonly constructorName = 'CreditDeductionQueueService';

  constructor(
    @InjectQueue('credit-deduction') private readonly queue: Queue,
    private readonly logger: LoggerService,
  ) {}

  async queueDeduction(data: CreditDeductionJobData): Promise<void> {
    await this.queue.add('deduct-credits', data, {
      jobId: `credit-deduct-${data.organizationId}-${Date.now()}`,
    });

    this.logger.log(`${this.constructorName} credit deduction job queued`, {
      amount: data.amount,
      organizationId: data.organizationId,
      type: data.type,
    });
  }

  async queueByokUsage(data: CreditDeductionJobData): Promise<void> {
    await this.queue.add('record-byok-usage', data, {
      jobId: `byok-usage-${data.organizationId}-${Date.now()}`,
    });

    this.logger.log(`${this.constructorName} BYOK usage job queued`, {
      amount: data.amount,
      organizationId: data.organizationId,
      type: data.type,
    });
  }
}
