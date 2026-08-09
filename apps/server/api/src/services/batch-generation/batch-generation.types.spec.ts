import { ReviewDecision } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import { cloneBatchItems } from './batch-generation.types';

describe('cloneBatchItems review decisions', () => {
  it('normalizes persisted aliases, missing values, events, and unknown values', () => {
    const items = cloneBatchItems([
      {
        id: 'approved',
        reviewDecision: 'APPROVED',
        reviewEvents: [{ decision: 'REQUEST_CHANGES' }],
      },
      { id: 'missing' },
      { id: 'unknown', reviewDecision: 'surprise' },
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        id: 'approved',
        reviewDecision: ReviewDecision.APPROVED,
        reviewEvents: [
          expect.objectContaining({
            decision: ReviewDecision.REQUEST_CHANGES,
          }),
        ],
      }),
      expect.objectContaining({
        id: 'missing',
        reviewDecision: ReviewDecision.UNSET,
        reviewEvents: [],
      }),
      expect.objectContaining({
        id: 'unknown',
        reviewDecision: ReviewDecision.UNSET,
        reviewEvents: [],
      }),
    ]);
  });
});
