import {
  toMessengerThreads,
  toPageComments,
} from '@api/services/integrations/facebook/utils/facebook-inbox.util';
import { describe, expect, it } from 'vitest';

const PAGE_ID = '1010';

describe('toPageComments', () => {
  it('flattens comments onto their post and groups a reply under its parent', () => {
    const comments = toPageComments(
      [
        {
          comments: {
            data: [
              {
                created_time: '2026-11-23T10:00:00+0000',
                from: { id: '777', name: 'Taylor' },
                id: '1010_55',
                message: 'Love this',
              },
              {
                created_time: '2026-11-23T10:05:00+0000',
                from: { id: '888', name: 'Jordan' },
                id: '1010_56',
                message: 'Same',
                parent: { id: '1010_55' },
              },
            ],
          },
          id: '1010_9',
          message: 'Launch day',
          permalink_url: 'https://facebook.example/1010/posts/9',
        },
      ],
      PAGE_ID,
    );

    expect(comments).toEqual([
      {
        authorExternalId: '777',
        authorName: 'Taylor',
        commentId: '1010_55',
        createdAt: new Date('2026-11-23T10:00:00.000Z'),
        isFromPage: false,
        postId: '1010_9',
        postTitle: 'Launch day',
        postUrl: 'https://facebook.example/1010/posts/9',
        text: 'Love this',
        threadId: '1010_55',
      },
      {
        authorExternalId: '888',
        authorName: 'Jordan',
        commentId: '1010_56',
        createdAt: new Date('2026-11-23T10:05:00.000Z'),
        isFromPage: false,
        postId: '1010_9',
        postTitle: 'Launch day',
        postUrl: 'https://facebook.example/1010/posts/9',
        text: 'Same',
        threadId: '1010_55',
      },
    ]);
  });

  it('flags the Page as the author of its own reply', () => {
    const [comment] = toPageComments(
      [
        {
          comments: {
            data: [
              {
                created_time: '2026-11-23T10:10:00+0000',
                from: { id: PAGE_ID, name: 'Acme' },
                id: '1010_57',
                message: 'Thanks!',
                parent: { id: '1010_55' },
              },
            ],
          },
          id: '1010_9',
        },
      ],
      PAGE_ID,
    );

    expect(comment?.isFromPage).toBe(true);
  });

  it('drops a comment with no text or no timestamp, and a post with no comments', () => {
    expect(
      toPageComments(
        [
          {
            comments: {
              data: [
                { created_time: '2026-11-23T10:00:00+0000', id: 'a' },
                { id: 'b', message: 'no time' },
                { created_time: 'garbage', id: 'c', message: 'bad time' },
              ],
            },
            id: 'post-1',
          },
          { id: 'post-2' },
        ],
        PAGE_ID,
      ),
    ).toEqual([]);
  });
});

describe('toMessengerThreads', () => {
  it("keeps only the person's text messages and names the person from the participants", () => {
    const threads = toMessengerThreads(
      [
        {
          id: 't_1',
          messages: {
            data: [
              {
                created_time: '2026-11-23T10:00:00+0000',
                from: { id: '777', name: 'Taylor' },
                id: 'm_1',
                message: '  Hello  ',
              },
              {
                created_time: '2026-11-23T10:01:00+0000',
                from: { id: PAGE_ID, name: 'Acme' },
                id: 'm_2',
                message: 'Hi Taylor',
              },
              {
                created_time: '2026-11-23T10:02:00+0000',
                from: { id: '777' },
                id: 'm_3',
              },
              { from: { id: '777' }, id: 'm_4', message: 'no time' },
            ],
          },
          participants: {
            data: [
              { id: PAGE_ID, name: 'Acme' },
              { id: '777', name: 'Taylor' },
            ],
          },
        },
        { messages: { data: [] } },
      ],
      PAGE_ID,
    );

    expect(threads).toEqual([
      {
        conversationId: 't_1',
        messages: [
          {
            createdAt: new Date('2026-11-23T10:00:00.000Z'),
            messageId: 'm_1',
            senderExternalId: '777',
            senderName: 'Taylor',
            text: 'Hello',
          },
        ],
        participantExternalId: '777',
        participantName: 'Taylor',
      },
    ]);
  });
});
