import { extractInboundCandidatesFromXActivityPayload } from '@api/services/reply-bot/x-activity-event.util';
import { describe, expect, it } from 'vitest';

describe('extractInboundCandidatesFromXActivityPayload', () => {
  it('maps AAA tweet_create_events replies', () => {
    const candidates = extractInboundCandidatesFromXActivityPayload({
      for_user_id: 'brand-x-id',
      tweet_create_events: [
        {
          id_str: 'c1',
          in_reply_to_status_id_str: 'p1',
          text: 'Thanks for this!',
          user: { id_str: 'u2', screen_name: 'reader' },
        },
      ],
    });

    expect(candidates).toEqual([
      {
        commentAuthorId: 'u2',
        commentAuthorUsername: 'reader',
        commentId: 'c1',
        commentText: 'Thanks for this!',
        forUserId: 'brand-x-id',
        parentPostId: 'p1',
      },
    ]);
  });

  it('skips own posts and non-replies', () => {
    expect(
      extractInboundCandidatesFromXActivityPayload({
        for_user_id: 'brand-x-id',
        tweet_create_events: [
          {
            author_id: 'brand-x-id',
            id: 'p1',
            text: 'My root post',
          },
        ],
      }),
    ).toEqual([]);
  });

  it('maps referenced_tweets replied_to', () => {
    const candidates = extractInboundCandidatesFromXActivityPayload({
      events: [
        {
          event_type: 'post.create',
          post: {
            author_id: 'u9',
            id: 'c9',
            referenced_tweets: [{ id: 'parent-9', type: 'replied_to' }],
            text: 'A reply',
            user: { username: 'alice' },
          },
        },
      ],
    });

    expect(candidates[0]).toMatchObject({
      commentId: 'c9',
      parentPostId: 'parent-9',
    });
  });
});
