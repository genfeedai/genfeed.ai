import type { BrandValidationReceiptService } from '@api/services/brand-validation/brand-validation-receipt.service';
import type { BrandVisionJobData } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { BrandVisionProcessor } from './brand-vision.processor';

const data: BrandVisionJobData = {
  actorId: 'user-a',
  brandId: 'brand-a',
  organizationId: 'org-a',
  receiptId: 'receipt-a',
};
const job = { data } as Job<BrandVisionJobData>;

function setup(result: unknown) {
  const validation = { completeVisionChecks: vi.fn(async () => result) };
  const logger = { log: vi.fn() };
  const processor = new BrandVisionProcessor(
    validation as unknown as BrandValidationReceiptService,
    logger as unknown as LoggerService,
  );
  return { logger, processor, validation };
}

describe('BrandVisionProcessor', () => {
  it('finishes the pending checks of the receipt as the actor who produced it', async () => {
    const { logger, processor, validation } = setup({
      receipt: { state: 'needs_review' },
      replayed: false,
    });
    await processor.process(job);
    expect(validation.completeVisionChecks).toHaveBeenCalledWith(
      { actorId: 'user-a', brandId: 'brand-a', organizationId: 'org-a' },
      'receipt-a',
    );
    expect(logger.log).toHaveBeenCalledWith(
      'BrandVisionProcessor finished',
      expect.objectContaining({
        outcome: 'revalidated',
        receiptId: 'receipt-a',
      }),
    );
  });

  it('leaves a receipt with nothing pending alone', async () => {
    const { logger, processor } = setup({
      receipt: { state: 'ready' },
      replayed: true,
    });
    await processor.process(job);
    expect(logger.log).toHaveBeenCalledWith(
      'BrandVisionProcessor finished',
      expect.objectContaining({ outcome: 'replayed' }),
    );
  });

  it('skips when no analysis is configured', async () => {
    const { logger, processor } = setup(null);
    await processor.process(job);
    expect(logger.log).toHaveBeenCalledWith(
      'BrandVisionProcessor finished',
      expect.objectContaining({ outcome: 'skipped' }),
    );
  });

  it('fails the job, running once, when the receipt cannot be read or written', async () => {
    const { processor, validation } = setup(null);
    validation.completeVisionChecks.mockRejectedValueOnce(
      new Error('receipt_state_conflict'),
    );
    await expect(processor.process(job)).rejects.toThrow(
      'receipt_state_conflict',
    );
  });
});
