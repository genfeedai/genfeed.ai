import {
  parseLinkedInVerificationPage,
  parseThreadsVerificationPage,
  parseTwitterVerificationPage,
  verificationPostUrl,
} from '@api/services/integrations/publishers/publisher-verification-pages.util';
import { describe, expect, it } from 'vitest';

describe('provider verification page contracts', () => {
  it('requires a normal public post link instead of active or credentialed URLs', () => {
    expect(verificationPostUrl('https://provider.example/post')).toBe(
      'https://provider.example/post',
    );
    expect(() => verificationPostUrl('javascript:alert(1)')).toThrow();
    expect(() =>
      verificationPostUrl('https://secret@provider.example/post'),
    ).toThrow();
  });
  it('reads X full text, quote semantics, and cursor without accepting partial errors', () => {
    const page = parseTwitterVerificationPage(
      {
        data: [
          {
            id: 'tweet',
            author_id: 'account',
            created_at: '2026-10-03T10:00:00Z',
            text: 'truncated',
            note_tweet: { text: 'full text' },
            referenced_tweets: [{ type: 'quoted', id: 'quote' }],
          },
        ],
        meta: { next_token: 'next', result_count: 1 },
      },
      'account',
    );
    expect(page).toMatchObject({
      items: [{ id: 'tweet', text: 'full text', quoteId: 'quote' }],
      nextCursor: 'next',
    });
    expect(() =>
      parseTwitterVerificationPage(
        { data: [], errors: [{}], meta: { result_count: 0 } },
        'account',
      ),
    ).toThrow();
    expect(() =>
      parseTwitterVerificationPage(
        {
          data: [
            {
              id: 'tweet',
              author_id: 'account',
              created_at: '2026-10-03T10:00:00Z',
              text: 'caption',
              referenced_tweets: [{ type: 'quoted' }],
            },
          ],
          meta: { result_count: 1 },
        },
        'account',
      ),
    ).toThrow();
  });

  it('accepts the documented X empty response only with an explicit zero count', () => {
    expect(
      parseTwitterVerificationPage({ meta: { result_count: 0 } }, 'account')
        .items,
    ).toEqual([]);
    expect(() => parseTwitterVerificationPage({}, 'account')).toThrow();
  });

  it('requires exact X author and timestamp proof', () => {
    expect(() =>
      parseTwitterVerificationPage(
        {
          data: [
            {
              id: 'tweet',
              author_id: 'other',
              created_at: '2026-10-03T10:00:00Z',
              text: 'caption',
            },
          ],
          meta: { result_count: 1 },
        },
        'account',
      ),
    ).toThrow();
    expect(() =>
      parseTwitterVerificationPage(
        {
          data: [{ id: 'tweet', author_id: 'account', text: 'caption' }],
          meta: { result_count: 1 },
        },
        'account',
      ),
    ).toThrow();
  });

  it('uses LinkedIn total/count/start and checks author/lifecycle', () => {
    const post = {
      id: 'urn:li:ugcPost:1',
      author: 'urn:li:person:account',
      created: { time: 1791021600000 },
      lifecycleState: 'PUBLISHED',
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: 'caption' },
          shareMediaCategory: 'NONE',
        },
      },
    };
    expect(
      parseLinkedInVerificationPage(
        { elements: [post], paging: { start: 0, count: 1, total: 2 } },
        'urn:li:person:account',
      ),
    ).toMatchObject({ nextCursor: '1', items: [{ hasMedia: false }] });
    expect(() =>
      parseLinkedInVerificationPage(
        { elements: [post] },
        'urn:li:person:account',
      ),
    ).toThrow();
    expect(() =>
      parseLinkedInVerificationPage(
        { elements: [post], paging: { start: 0, count: 1, total: 1 } },
        'urn:li:person:other',
      ),
    ).toThrow();
  });

  it('reads Threads TEXT_POST and requires safe cursor evidence', () => {
    const item = {
      id: 'thread',
      text: 'caption',
      media_type: 'TEXT_POST',
      timestamp: '2026-10-03T10:00:00Z',
      is_reply: false,
      is_quote_post: false,
    };
    expect(
      parseThreadsVerificationPage({
        data: [item],
        paging: {
          next: 'https://graph.threads.net/next',
          cursors: { after: 'next' },
        },
      }),
    ).toMatchObject({
      nextCursor: 'next',
      items: [{ hasMedia: false, isReply: false }],
    });
    expect(() =>
      parseThreadsVerificationPage({
        data: [item],
        paging: { next: 'https://evil.example/' },
      }),
    ).toThrow();
    expect(() =>
      parseThreadsVerificationPage({
        data: [{ ...item, is_reply: undefined }],
      }),
    ).toThrow();
    expect(() =>
      parseThreadsVerificationPage({
        data: [{ ...item, is_quote_post: undefined }],
      }),
    ).toThrow();
    expect(
      parseThreadsVerificationPage({ data: [{ ...item, is_quote_post: true }] })
        .items[0]?.isQuote,
    ).toBe(true);
  });
});
