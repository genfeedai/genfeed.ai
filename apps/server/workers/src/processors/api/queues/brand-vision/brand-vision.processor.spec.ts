import type { BrandValidationReceiptService } from '@api/services/brand-validation/brand-validation-receipt.service';
import type { BrandVisionJobData } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Job } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { BrandVisionProcessor } from './brand-vision.processor';

const data: BrandVisionJobData = {
  actorId: 'user-a',
  brandId: 'brand-a',
  organizationId: 'org-a',
  receiptId: 'receipt-a',
};
const job = { data } as Job<BrandVisionJobData>;

/**
 * The processor against a receipt service that records which receipt it was
 * asked to finish and as whom, and a logger that keeps the finished summary.
 */
function processorReturning(result: unknown, failure?: Error) {
  const checked: unknown[] = [];
  const summaries: unknown[] = [];
  const validation = {
    completeVisionChecks: async (actor: unknown, receiptId: string) => {
      checked.push({ actor, receiptId });
      if (failure) {
        throw failure;
      }
      return result;
    },
  };
  const logger = {
    log: (_message: string, summary: unknown) => {
      summaries.push(summary);
    },
  };
  const processor = new BrandVisionProcessor(
    validation as unknown as BrandValidationReceiptService,
    logger as unknown as LoggerService,
  );
  return { checked, processor, summaries };
}

describe('BrandVisionProcessor', () => {
  it('finishes the pending checks of the receipt as the actor who produced it', async () => {
    const { checked, processor } = processorReturning({
      receipt: { state: 'needs_review' },
      replayed: false,
    });

    await processor.process(job);

    expect(checked).toEqual([
      {
        actor: {
          actorId: 'user-a',
          brandId: 'brand-a',
          organizationId: 'org-a',
        },
        receiptId: 'receipt-a',
      },
    ]);
  });

  it.each([
    [
      'revalidated',
      { receipt: { state: 'needs_review' }, replayed: false },
      'needs_review',
    ],
    ['replayed', { receipt: { state: 'ready' }, replayed: true }, 'ready'],
    ['skipped', null, undefined],
  ])('logs a %s receipt', async (outcome, result, state) => {
    const { processor, summaries } = processorReturning(result);

    await processor.process(job);

    expect(summaries).toEqual([{ outcome, receiptId: 'receipt-a', state }]);
  });

  it('fails the job, running once, when the receipt cannot be read or written', async () => {
    const { checked, processor, summaries } = processorReturning(
      null,
      new Error('receipt_state_conflict'),
    );

    await expect(processor.process(job)).rejects.toThrow(
      'receipt_state_conflict',
    );
    expect(checked).toHaveLength(1);
    expect(summaries).toEqual([]);
  });
});
