import { ReviewDecision } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import { cloneBatchItems, resolveBatchItems } from './batch-generation.types';

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

describe('resolveBatchItems reader ratchet', () => {
  it('prefers typed batch_items rows when any live rows exist', () => {
    const items = resolveBatchItems({
      batchItems: [
        {
          data: {
            id: 'from-row',
            reviewDecision: 'APPROVED',
          },
          isDeleted: false,
        },
        {
          data: { id: 'tombstone' },
          isDeleted: true,
        },
      ],
      items: [{ id: 'from-json', reviewDecision: 'REJECTED' }],
    });

    expect(items).toEqual([
      expect.objectContaining({
        id: 'from-row',
        reviewDecision: ReviewDecision.APPROVED,
      }),
    ]);
  });

  it('prefers the typed assigneeId column over JSON identity', () => {
    const items = resolveBatchItems({
      batchItems: [
        {
          assigneeId: 'user-typed',
          data: {
            assignee: {
              displayName: 'Should not leak',
              email: 'secret@example.com',
              id: 'user-json',
            },
            assigneeId: 'user-json',
            id: 'from-row',
            reviewDecision: 'UNSET',
          },
          isDeleted: false,
        },
      ],
    });

    expect(items).toEqual([
      expect.objectContaining({
        assigneeId: 'user-typed',
        id: 'from-row',
      }),
    ]);
    expect(items[0]).not.toHaveProperty('assignee.email');
  });

  it('falls back to Batch.items JSON when typed rows are absent', () => {
    const items = resolveBatchItems({
      items: [{ id: 'from-json', reviewDecision: 'APPROVED' }],
    });

    expect(items).toEqual([
      expect.objectContaining({
        id: 'from-json',
        reviewDecision: ReviewDecision.APPROVED,
      }),
    ]);
  });
});
