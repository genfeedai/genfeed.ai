import { toThreadsReplies } from '@api/services/integrations/threads/utils/threads-reply.util';
import { describe, expect, it } from 'vitest';

const post = {
  id: 'post-1',
  permalink: 'https://www.threads.net/@brand/post/abc',
  text: 'Launch day',
};

describe('toThreadsReplies', () => {
  it('keeps a whole exchange under the reply that answers the post', () => {
    const replies = toThreadsReplies([
      {
        ...post,
        replies: [
          {
            id: 'r1',
            replied_to: { id: 'post-1' },
            text: 'Congrats!',
            timestamp: '2026-11-20T10:00:00+0000',
            username: 'ada',
          },
          {
            id: 'r2',
            is_reply_owned_by_me: true,
            replied_to: { id: 'r1' },
            text: 'Thank you',
            timestamp: '2026-11-20T10:05:00+0000',
            username: 'brand',
          },
          {
            id: 'r3',
            replied_to: { id: 'r2' },
            text: 'When is the next one?',
            timestamp: '2026-11-20T10:10:00+0000',
            username: 'ada',
          },
        ],
      },
    ]);

    expect(
      replies.map(({ isOwn, parentId, replyId, threadId }) => ({
        isOwn,
        parentId,
        replyId,
        threadId,
      })),
    ).toEqual([
      { isOwn: false, parentId: 'post-1', replyId: 'r1', threadId: 'r1' },
      { isOwn: true, parentId: 'r1', replyId: 'r2', threadId: 'r1' },
      { isOwn: false, parentId: 'r2', replyId: 'r3', threadId: 'r1' },
    ]);
    expect(replies[0]).toMatchObject({
      authorHandle: 'ada',
      postId: 'post-1',
      postTitle: 'Launch day',
      postUrl: 'https://www.threads.net/@brand/post/abc',
      text: 'Congrats!',
    });
  });

  it('skips a reply without text or a valid time', () => {
    expect(
      toThreadsReplies([
        {
          ...post,
          replies: [
            { id: 'a', text: '  ', timestamp: '2026-11-20T10:00:00+0000' },
            { id: 'b', text: 'hi', timestamp: 'not a date' },
            { id: 'c', text: 'ok', timestamp: '2026-11-20T10:00:00+0000' },
          ],
        },
      ]).map((reply) => reply.replyId),
    ).toEqual(['c']);
  });

  it('terminates on a cyclic payload', () => {
    const replies = toThreadsReplies([
      {
        ...post,
        replies: [
          {
            id: 'a',
            replied_to: { id: 'b' },
            text: 'x',
            timestamp: '2026-11-20T10:00:00+0000',
          },
          {
            id: 'b',
            replied_to: { id: 'a' },
            text: 'y',
            timestamp: '2026-11-20T10:01:00+0000',
          },
        ],
      },
    ]);

    expect(replies).toHaveLength(2);
  });
});
