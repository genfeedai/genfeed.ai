import type { BrandedGenerationReceiptReadV1 } from '@genfeedai/contracts/interfaces/content/branded-generation-receipt-read.interface';
import { describe, expect, it } from 'vitest';
import {
  getGenerationReceiptCost,
  getGenerationReceiptMediaId,
  getGenerationReceiptStatus,
} from './generation-receipt-summary.util';

type Costs = BrandedGenerationReceiptReadV1['costs'];

function receipt(
  overrides: Partial<BrandedGenerationReceiptReadV1>,
): BrandedGenerationReceiptReadV1 {
  return {
    contentType: 'post',
    artifact: null,
    generationId: null,
    costs: [],
    ...overrides,
  } as BrandedGenerationReceiptReadV1;
}

describe('generation receipt summary', () => {
  it.each([
    ['created', 'pending'],
    ['resolved', 'pending'],
    ['dispatched', 'pending'],
    ['checking', 'pending'],
    ['ready', 'completed'],
    ['needs_review', 'needsReview'],
    ['blocked', 'blocked'],
    ['failed', 'failed'],
    ['cancelled', 'cancelled'],
  ] as const)('reads state %s as %s', (state, status) => {
    expect(getGenerationReceiptStatus(state)).toBe(status);
  });

  it('finds the output of a bound or still-pending Studio media receipt only', () => {
    expect(
      getGenerationReceiptMediaId(
        receipt({
          contentType: 'image',
          generationId: 'ingredient-1',
          artifact: {
            kind: 'ingredient',
            id: 'ingredient-2',
          } as BrandedGenerationReceiptReadV1['artifact'],
        }),
      ),
    ).toBe('ingredient-2');
    expect(
      getGenerationReceiptMediaId(
        receipt({ contentType: 'video', generationId: 'ingredient-1' }),
      ),
    ).toBe('ingredient-1');
    expect(
      getGenerationReceiptMediaId(
        receipt({ contentType: 'post', generationId: 'post-1' }),
      ),
    ).toBeNull();
    expect(
      getGenerationReceiptMediaId(
        receipt({
          contentType: 'post',
          artifact: {
            kind: 'post',
            id: 'post-1',
          } as BrandedGenerationReceiptReadV1['artifact'],
        }),
      ),
    ).toBeNull();
  });

  it('sums ledger-backed credits and never estimates the rest', () => {
    const known: Costs = [
      {
        id: 'a',
        stage: 'generation',
        status: 'known',
        ledgerId: 'l1',
        credits: 2,
      },
      {
        id: 'b',
        stage: 'validation',
        status: 'known',
        ledgerId: 'l2',
        credits: 1,
      },
      { id: 'c', stage: 'render', status: 'pending' },
    ];
    expect(getGenerationReceiptCost(receipt({ costs: known }))).toEqual({
      status: 'known',
      credits: 3,
    });
    expect(
      getGenerationReceiptCost(
        receipt({
          costs: [
            {
              id: 'a',
              stage: 'generation',
              status: 'unavailable',
              reasonCode: 'x',
            },
            { id: 'b', stage: 'render', status: 'pending' },
          ],
        }),
      ),
    ).toEqual({ status: 'pending' });
    expect(
      getGenerationReceiptCost(
        receipt({
          costs: [
            {
              id: 'a',
              stage: 'generation',
              status: 'unavailable',
              reasonCode: 'x',
            },
          ],
        }),
      ),
    ).toEqual({ status: 'unavailable' });
    expect(getGenerationReceiptCost(receipt({ costs: [] }))).toEqual({
      status: 'none',
    });
  });
});
