import { LlmVendorCostLedgerService } from '@api/services/integrations/llm/llm-vendor-cost-ledger.service';
import {
  LLM_COST_SETTLEMENT_QUEUE,
  type LlmCostSettlementJobData,
} from '@genfeedai/contracts/queue';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
@Processor(LLM_COST_SETTLEMENT_QUEUE)
export class LlmCostSettlementProcessor extends WorkerHost {
  constructor(private readonly ledger: LlmVendorCostLedgerService) {
    super();
  }
  async process(job: Job<LlmCostSettlementJobData>): Promise<void> {
    await this.ledger.record(job.data);
  }
}
