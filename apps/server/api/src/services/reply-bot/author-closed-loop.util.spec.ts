import { mergeAuthorClosedLoopData } from '@api/services/reply-bot/author-closed-loop.util';
import { describe, expect, it } from 'vitest';

describe('mergeAuthorClosedLoopData', () => {
  it('increments authorClosedLoops and stamps metadata', () => {
    const merged = mergeAuthorClosedLoopData(
      { hookUsed: 'ship' },
      {
        at: new Date('2026-08-12T12:00:00.000Z'),
        commentId: 'c1',
        replyContentId: 'r1',
      },
    );

    expect(merged).toMatchObject({
      authorClosedLoops: 1,
      hookUsed: 'ship',
      lastAuthorReplyAt: '2026-08-12T12:00:00.000Z',
      lastAuthorReplyCommentId: 'c1',
      lastAuthorReplyContentId: 'r1',
    });
  });

  it('increments from prior count', () => {
    const merged = mergeAuthorClosedLoopData(
      { authorClosedLoops: 3 },
      { commentId: 'c2' },
    );
    expect(merged.authorClosedLoops).toBe(4);
  });
});
