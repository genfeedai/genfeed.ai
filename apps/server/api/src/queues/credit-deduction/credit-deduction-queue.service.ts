import { randomUUID } from 'node:crypto';
import { currentWorkflowAccountingScope } from '@api/collections/workflow-executions/services/workflow-accounting.context';
import {
  CREDIT_DEDUCTION_QUEUE,
  CreditDeductionJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

function toBullMqJobId(value: string): string {
  return value.replaceAll(':', '-');
}

@Injectable()
export class CreditDeductionQueueService {
  private readonly constructorName = 'CreditDeductionQueueService';

  constructor(
    @InjectQueue(CREDIT_DEDUCTION_QUEUE) private readonly queue: Queue,
    private readonly logger: LoggerService,
  ) {}

  async queueDeduction(data: CreditDeductionJobData): Promise<void> {
    const scope = currentWorkflowAccountingScope();
    if (scope?.organizationId === data.organizationId)
      data = {
        ...data,
        workflowAccounting: scope,
        idempotencyKey: data.idempotencyKey ?? randomUUID(),
      };
    await this.queue.add('deduct-credits', data, {
      ...(data.settlementAssetId
        ? { attempts: 20_160, backoff: { delay: 30_000, type: 'fixed' } }
        : {}),
      jobId: toBullMqJobId(
        data.idempotencyKey
          ? `credit-deduct-${data.organizationId}-${data.idempotencyKey}`
          : `credit-deduct-${data.organizationId}-${Date.now()}`,
      ),
    });

    this.logger.log(`${this.constructorName} credit deduction job queued`, {
      amount: data.amount,
      idempotencyKey: data.idempotencyKey,
      organizationId: data.organizationId,
      type: data.type,
    });
  }

  async queueByokUsage(data: CreditDeductionJobData): Promise<void> {
    const scope = currentWorkflowAccountingScope();
    if (scope?.organizationId === data.organizationId)
      data = {
        ...data,
        workflowAccounting: scope,
        idempotencyKey: data.idempotencyKey ?? randomUUID(),
      };
    await this.queue.add('record-byok-usage', data, {
      jobId: toBullMqJobId(
        data.idempotencyKey
          ? `byok-usage-${data.organizationId}-${data.idempotencyKey}`
          : `byok-usage-${data.organizationId}-${Date.now()}`,
      ),
    });

    this.logger.log(`${this.constructorName} BYOK usage job queued`, {
      amount: data.amount,
      organizationId: data.organizationId,
      type: data.type,
    });
  }
}
