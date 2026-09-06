import {
  LLM_COST_SETTLEMENT_QUEUE,
  type LlmCostSettlementJobData,
} from '@genfeedai/contracts/queue';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
@Injectable()
export class LlmCostSettlementQueueService {
  constructor(
    @InjectQueue(LLM_COST_SETTLEMENT_QUEUE)
    private readonly queue: Queue<LlmCostSettlementJobData>,
  ) {}
  async enqueue(input: LlmCostSettlementJobData): Promise<void> {
    await this.queue.add('settle-provider-cost', input, {
      jobId: input.workflowLedgerId,
      attempts: 100,
      backoff: { type: 'fixed', delay: 30000 },
      removeOnComplete: 1000,
      removeOnFail: false,
    });
  }
}
