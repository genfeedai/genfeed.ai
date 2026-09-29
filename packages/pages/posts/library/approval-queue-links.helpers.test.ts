import { describe, expect, it } from 'vitest';
import {
  buildApprovalQueueHref,
  buildPostsHrefFromApprovalQueue,
} from './approval-queue-links.helpers';

describe('approval queue cross-links', () => {
  it('links plainly when nothing is selected', () => {
    expect(buildApprovalQueueHref('')).toBe('/publishing/review');
    expect(buildPostsHrefFromApprovalQueue('view=calendar')).toBe(
      '/publishing/posts',
    );
  });
});
