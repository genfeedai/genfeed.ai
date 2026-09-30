import { describe, expect, it } from 'vitest';
import {
  buildApprovalQueueHref,
  buildPostsHrefFromApprovalQueue,
} from './approval-queue-links.helpers';

describe('approval queue cross-links', () => {
  it('carries the selected batch and item from Posts into the approval queue', () => {
    expect(
      buildApprovalQueueHref('batch=batch-1&item=item-9&status=draft&page=2'),
    ).toBe('/publishing/review?batch=batch-1&item=item-9');
  });

  it('returns to Posts with the same batch and item, dropping queue-only filters', () => {
    expect(
      buildPostsHrefFromApprovalQueue(
        new URLSearchParams('batch=batch-1&filter=ready&item=item-9'),
      ),
    ).toBe('/publishing/posts?batch=batch-1&item=item-9');
  });

  it('links plainly when nothing is selected', () => {
    expect(buildApprovalQueueHref('')).toBe('/publishing/review');
    expect(buildPostsHrefFromApprovalQueue('view=calendar')).toBe(
      '/publishing/posts',
    );
  });
});
