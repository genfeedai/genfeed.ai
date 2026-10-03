import {
  parseBeehiivVerificationPage,
  parseGhostVerificationPage,
  parseShopifyVerificationPage,
  parseWordpressVerificationPage,
} from '@api/services/integrations/publishers/publisher-article-verification-pages.util';
import { parseMastodonVerificationPage } from '@api/services/integrations/publishers/publisher-verification-pages.util';
import { describe, expect, it } from 'vitest';

describe('article and instance verification evidence', () => {
  it('keeps WordPress raw edit HTML and requires explicit pagination totals', () => {
    const post = {
      ID: 42,
      date: '2026-10-03T10:00:01Z',
      content: '<p>Exact body</p>',
      title: 'Exact title',
      status: 'publish',
      featured_image: '',
    };
    expect(
      parseWordpressVerificationPage({ found: 1, posts: [post] }, 0),
    ).toMatchObject({
      items: [{ id: '42', text: '<p>Exact body</p>' }],
      nextCursor: null,
    });
    expect(() =>
      parseWordpressVerificationPage({ posts: [post] }, 0),
    ).toThrow();
    expect(() =>
      parseWordpressVerificationPage({ found: 200, posts: [post] }, 0),
    ).toThrow('pagination');
  });

  it('throws for missing Ghost raw HTML instead of treating the post absent', () => {
    expect(() =>
      parseGhostVerificationPage(
        {
          posts: [
            {
              id: 'post',
              created_at: '2026-10-03T10:00:01Z',
              title: 'Title',
              status: 'published',
              feature_image: null,
              url: 'https://ghost.example/post',
            },
          ],
          meta: { pagination: { page: 1, total: 1, limit: 100 } },
        },
        1,
      ),
    ).toThrow();
  });

  it('rejects Shopify partial errors and missing image/cursor evidence', () => {
    expect(() =>
      parseShopifyVerificationPage({
        errors: [{ message: 'forbidden field' }],
        data: { products: { edges: [], pageInfo: { hasNextPage: false } } },
      }),
    ).toThrow();
    expect(() =>
      parseShopifyVerificationPage({
        data: { products: { edges: [], pageInfo: { hasNextPage: true } } },
      }),
    ).toThrow();
  });

  it('uses Beehiiv immutable created time and documented created DESC window coverage', () => {
    const startedAt = new Date('2026-10-03T10:00:00Z');
    const newer = {
      id: 'newer',
      created: 1791021601,
      title: 'Title',
      content: { free: { web: '<p>body</p>' } },
      status: 'confirmed',
      web_url: 'https://newsletter.example/post',
    };
    const older = { ...newer, id: 'older', created: 1791021500 };
    const nodes = Array.from({ length: 100 }, (_, index) =>
      index === 99 ? older : newer,
    );
    expect(
      parseBeehiivVerificationPage(
        { data: nodes, page: 1, total_results: 200 },
        1,
        startedAt,
      ).nextCursor,
    ).toBeNull();
    expect(() =>
      parseBeehiivVerificationPage(
        { data: [older, newer], page: 1, total_results: 2 },
        1,
        startedAt,
      ),
    ).toThrow('ordering');
    expect(() =>
      parseBeehiivVerificationPage(
        { data: [{ ...newer, created: undefined }], page: 1, total_results: 1 },
        1,
        startedAt,
      ),
    ).toThrow();
  });

  it('never follows provider next URLs or changes Mastodon instance/account', () => {
    const endpoint =
      'https://mastodon.example/api/v1/accounts/account/statuses';
    const item = {
      id: 'status',
      created_at: '2026-10-03T10:00:00Z',
      content: '<p>body</p>',
      account: { id: 'account' },
      media_attachments: [],
      reblog: null,
      in_reply_to_id: null,
      spoiler_text: '',
      visibility: 'public',
      url: 'https://mastodon.example/status',
    };
    expect(
      parseMastodonVerificationPage(
        [item],
        'account',
        `<${endpoint}?max_id=older>; rel="next"`,
        endpoint,
      ).nextCursor,
    ).toBe('older');
    expect(() =>
      parseMastodonVerificationPage(
        [item],
        'account',
        '<https://evil.example/?max_id=older>; rel="next"',
        endpoint,
      ),
    ).toThrow();
    expect(() =>
      parseMastodonVerificationPage([item], 'sibling', undefined, endpoint),
    ).toThrow();
    expect(() =>
      parseMastodonVerificationPage(
        Array(40).fill(item),
        'account',
        undefined,
        endpoint,
      ),
    ).toThrow('pagination');
  });
});
