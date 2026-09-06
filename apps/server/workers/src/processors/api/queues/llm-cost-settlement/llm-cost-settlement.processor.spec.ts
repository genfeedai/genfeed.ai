import type { LlmVendorCostLedgerService } from '@api/services/integrations/llm/llm-vendor-cost-ledger.service';
import type { LlmCostSettlementJobData } from '@genfeedai/contracts/queue';
import { LlmCostSettlementProcessor } from '@workers/processors/api/queues/llm-cost-settlement/llm-cost-settlement.processor';
import type { Job } from 'bullmq';
import { expect, it, vi } from 'vitest';

it('retries only a frozen ledger settlement, never a provider operation', async () => {
  const ledger = {
    record: vi
      .fn()
      .mockRejectedValueOnce(new Error('database down'))
      .mockResolvedValue(undefined),
  };
  const processor = new LlmCostSettlementProcessor(
    ledger as unknown as LlmVendorCostLedgerService,
  );
  const data: LlmCostSettlementJobData = {
    workflowLedgerId: 'intent',
    organizationId: 'org',
    model: 'model',
    provider: 'provider',
    isByok: false,
    promptTokens: 10,
    completionTokens: 20,
    latencyMs: 30,
    vendorCostMicros: 123,
    costEvidence: 'observed',
  };
  const job = { data } as Job<LlmCostSettlementJobData>;
  await expect(processor.process(job)).rejects.toThrow('database down');
  await processor.process(job);
  expect(ledger.record.mock.calls).toEqual([[data], [data]]);
});
