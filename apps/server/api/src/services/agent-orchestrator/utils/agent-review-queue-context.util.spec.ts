import { readReviewQueueSnapshot } from '@api/services/agent-orchestrator/utils/agent-review-queue-context.util';
import { describe, expect, it } from 'vitest';

const counts = {
  approvedCount: 2,
  changesRequestedCount: 1,
  pendingCount: 3,
  readyCount: 4,
};

describe('readReviewQueueSnapshot', () => {
  it('keeps the structured queue counts', () => {
    expect(
      readReviewQueueSnapshot('list_review_queue', {
        success: true,
        data: counts,
      }),
    ).toEqual({ ...counts, unclassifiedCount: 0 });
  });

  it.each([0, 3])(
    'keeps %s summary items unclassified until the queue is inspected',
    (totalPending) => {
      expect(
        readReviewQueueSnapshot('get_approval_summary', {
          success: true,
          data: { totalPending },
        }),
      ).toEqual({
        approvedCount: 0,
        changesRequestedCount: 0,
        pendingCount: 0,
        readyCount: 0,
        unclassifiedCount: totalPending,
      });
    },
  );

  it.each([undefined, -1, NaN, Infinity, 1.5, '2'])(
    'does not treat invalid counts as evidence: %s',
    (readyCount) => {
      expect(
        readReviewQueueSnapshot('list_review_queue', {
          success: true,
          data: { ...counts, readyCount },
        }),
      ).toBeUndefined();
    },
  );

  it('ignores failed results and unrelated tools', () => {
    expect(
      readReviewQueueSnapshot('list_review_queue', {
        success: false,
        data: counts,
      }),
    ).toBeUndefined();
    expect(
      readReviewQueueSnapshot('get_posts', { success: true, data: counts }),
    ).toBeUndefined();
    expect(
      readReviewQueueSnapshot('list_review_queue', { success: true }),
    ).toBeUndefined();
  });
});
