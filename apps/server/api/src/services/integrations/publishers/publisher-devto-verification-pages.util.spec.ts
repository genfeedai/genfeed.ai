import {
  DEVTO_VERIFICATION_PAGE_SIZE,
  parseDevtoVerificationPage,
} from '@api/services/integrations/publishers/publisher-devto-verification-pages.util';
import { describe, expect, it } from 'vitest';

const startedAt = new Date('2026-10-03T10:00:00Z');

function article(
  id: number,
  createdAt: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    created_at: createdAt,
    id,
    published_at: createdAt,
    title: `Article ${id}`,
    url: `https://dev.to/vincent/article-${id}`,
    ...overrides,
  };
}

describe('parseDevtoVerificationPage', () => {
  it('reads a published article with its title, URL and creation time', () => {
    const page = parseDevtoVerificationPage(
      [article(7, '2026-10-03T10:00:03Z')],
      1,
      startedAt,
      false,
    );
    expect(page).toEqual({
      items: [
        {
          createdAt: new Date('2026-10-03T10:00:03Z'),
          hasMedia: false,
          id: '7',
          isReply: false,
          status: 'published',
          text: '',
          title: 'Article 7',
          url: 'https://dev.to/vincent/article-7',
        },
      ],
      nextCursor: null,
    });
  });

  it('reads a draft, which has no publish time', () => {
    const page = parseDevtoVerificationPage(
      [article(8, '2026-10-03T10:00:03Z', { published_at: null })],
      1,
      startedAt,
      true,
    );
    expect(page.items[0]).toMatchObject({ id: '8', status: 'draft' });
  });

  it('asks for the next page while a full page still reaches into the window', () => {
    const nodes = Array.from({ length: DEVTO_VERIFICATION_PAGE_SIZE }, (_, i) =>
      article(100 - i, '2026-10-03T10:00:03Z'),
    );
    expect(
      parseDevtoVerificationPage(nodes, 2, startedAt, false).nextCursor,
    ).toBe('3');
  });

  it('stops once a full page holds nothing since the attempt', () => {
    const nodes = Array.from({ length: DEVTO_VERIFICATION_PAGE_SIZE }, (_, i) =>
      article(100 - i, '2026-10-03T09:00:00Z'),
    );
    expect(
      parseDevtoVerificationPage(nodes, 1, startedAt, false).nextCursor,
    ).toBeNull();
  });

  it('refuses a page that is not newest first', () => {
    expect(() =>
      parseDevtoVerificationPage(
        [
          article(1, '2026-10-03T09:00:00Z'),
          article(2, '2026-10-03T10:00:03Z'),
        ],
        1,
        startedAt,
        false,
      ),
    ).toThrow('not newest first');
  });

  it('refuses a page larger than requested', () => {
    const nodes = Array.from(
      { length: DEVTO_VERIFICATION_PAGE_SIZE + 1 },
      (_, i) => article(200 - i, '2026-10-03T10:00:03Z'),
    );
    expect(() =>
      parseDevtoVerificationPage(nodes, 1, startedAt, false),
    ).toThrow('Incomplete Dev.to verification pagination');
  });

  it('refuses a body that is not a list', () => {
    expect(() =>
      parseDevtoVerificationPage(
        { error: 'unauthorized' },
        1,
        startedAt,
        false,
      ),
    ).toThrow('Incomplete provider verification list');
  });

  it('refuses a published article without a publish time', () => {
    expect(() =>
      parseDevtoVerificationPage(
        [article(9, '2026-10-03T10:00:03Z', { published_at: null })],
        1,
        startedAt,
        false,
      ),
    ).toThrow('Incomplete provider verification timestamp');
  });
});
