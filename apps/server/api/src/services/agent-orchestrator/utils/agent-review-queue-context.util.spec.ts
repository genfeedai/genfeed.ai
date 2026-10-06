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
    ).toEqual({ ...counts, scope: 'inbox' });
  });

  it('does not infer an empty review queue from zero items still generating', () => {
    expect(
      readReviewQueueSnapshot('get_approval_summary', {
        success: true,
        data: { totalPending: 0 },
      }),
    ).toBeUndefined();
  });

  it('treats positive approval-summary counts as generation still in progress', () => {
    expect(
      readReviewQueueSnapshot('get_approval_summary', {
        success: true,
        data: { totalPending: 3 },
      }),
    ).toEqual({
      approvedCount: 0,
      changesRequestedCount: 0,
      pendingCount: 3,
      readyCount: 0,
      scope: 'summary',
    });
  });

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
