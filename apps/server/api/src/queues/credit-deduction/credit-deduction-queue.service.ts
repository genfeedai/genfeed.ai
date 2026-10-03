import { currentWorkflowAccountingScope } from '@api/collections/workflow-executions/services/workflow-accounting.context';
import {
  CREDIT_DEDUCTION_QUEUE,
  type QueuedCreditChargeData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

function toBullMqJobId(value: string): string {
  return value.replaceAll(':', '-');
}

function assertIdempotencyKey(data: QueuedCreditChargeData): void {
  if (!data.idempotencyKey) {
    throw new BadRequestException(
      'A credit charge needs an idempotency key naming the thing it charges',
    );
  }
}

@Injectable()
export class CreditDeductionQueueService {
  private readonly constructorName = 'CreditDeductionQueueService';

  constructor(
    @InjectQueue(CREDIT_DEDUCTION_QUEUE) private readonly queue: Queue,
    private readonly logger: LoggerService,
  ) {}

  async queueDeduction(data: QueuedCreditChargeData): Promise<void> {
    assertIdempotencyKey(data);
    const scope = currentWorkflowAccountingScope();
    if (scope?.organizationId === data.organizationId)
      data = { ...data, workflowAccounting: scope };
    const jobId = toBullMqJobId(
      `credit-deduct-${data.organizationId}-${data.idempotencyKey}`,
    );
    if (await this.resumeExistingJob(jobId)) return;
    await this.queue.add('deduct-credits', data, {
      ...(data.acceptedGeneration ? { removeOnFail: false } : {}),
      ...(data.acceptedGeneration
        ? { attempts: 20_160, backoff: { delay: 30_000, type: 'fixed' } }
        : {}),
      jobId,
    });

    this.logger.log(`${this.constructorName} credit deduction job queued`, {
      amount: data.amount,
      idempotencyKey: data.idempotencyKey,
      organizationId: data.organizationId,
      type: data.type,
    });
  }

  async queueByokUsage(data: QueuedCreditChargeData): Promise<void> {
    assertIdempotencyKey(data);
    const scope = currentWorkflowAccountingScope();
    if (scope?.organizationId === data.organizationId)
      data = { ...data, workflowAccounting: scope };
    const jobId = toBullMqJobId(
      `byok-usage-${data.organizationId}-${data.idempotencyKey}`,
    );
    if (await this.resumeExistingJob(jobId)) return;
    await this.queue.add('record-byok-usage', data, {
      ...(data.acceptedGeneration
        ? { attempts: 20_160, backoff: { delay: 30_000, type: 'fixed' } }
        : {}),
      ...(data.acceptedGeneration ? { removeOnFail: false } : {}),
      jobId,
    });

    this.logger.log(`${this.constructorName} BYOK usage job queued`, {
      amount: data.amount,
      organizationId: data.organizationId,
      type: data.type,
    });
  }
  private async resumeExistingJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    if ((await job.getState()) === 'failed') {
      await job.retry('failed', { resetAttemptsMade: true });
    }
    return true;
  }
}
