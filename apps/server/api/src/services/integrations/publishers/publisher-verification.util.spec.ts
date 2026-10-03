import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import {
  verifyHtmlPublish,
  verifyProviderPublish,
  verifyTextPublish,
} from '@api/services/integrations/publishers/publisher-verification.util';
import { PostCategory } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

const startedAt = new Date('2026-10-03T10:00:00.123Z');
const now = new Date('2026-10-03T11:00:00Z');
const context = {
  hasThreadChildren: false,
  post: {
    category: PostCategory.TEXT,
    description: '<p>Exact caption</p>',
    ingredients: [],
  },
} as unknown as PublishContext;
const candidate = {
  createdAt: new Date('2026-10-03T10:00:01Z'),
  hasMedia: false,
  id: 'landed',
  isReply: false,
  text: 'Exact caption',
};

describe('bounded provider verification', () => {
  it.each([
    { visibility: 'private' },
    { scheduledAt: new Date('2026-10-03T12:00:00Z') },
  ])(
    'requires the expected audience and scheduled provider time',
    async (change) => {
      const item = {
        ...candidate,
        visibility: 'public',
        scheduledAt: new Date('2026-10-03T13:00:00Z'),
        ...change,
      };
      await expect(
        verifyProviderPublish(
          context,
          startedAt,
          vi.fn().mockResolvedValue({ items: [item], nextCursor: null }),
          {
            text: candidate.text,
            visibility: 'public',
            scheduledAt: new Date('2026-10-03T13:00:00Z'),
          },
          now,
        ),
      ).rejects.toThrow('ambiguous');
    },
  );
  it('requires the exact native HTML, title and provider status for articles', async () => {
    const input = {
      ...context,
      post: { ...context.post, label: 'Exact title' },
    };
    const item = {
      ...candidate,
      text: input.post.description,
      title: 'Exact title',
      status: 'published',
    };
    expect(
      await verifyHtmlPublish(
        input,
        startedAt,
        vi.fn().mockResolvedValue({ items: [item], nextCursor: null }),
        'published',
        now,
      ),
    ).toEqual(item);
    await expect(
      verifyHtmlPublish(
        input,
        startedAt,
        vi.fn().mockResolvedValue({
          items: [{ ...item, text: '<p>Provider changed the HTML</p>' }],
          nextCursor: null,
        }),
        'published',
        now,
      ),
    ).rejects.toThrow('ambiguous');
    await expect(
      verifyHtmlPublish(
        input,
        startedAt,
        vi.fn().mockResolvedValue({
          items: [{ ...item, status: 'draft' }],
          nextCursor: null,
        }),
        'published',
        now,
      ),
    ).rejects.toThrow('ambiguous');
    await expect(
      verifyHtmlPublish(
        input,
        startedAt,
        vi.fn().mockResolvedValue({
          items: [{ ...item, title: 'Provider changed the title' }],
          nextCursor: null,
        }),
        'published',
        now,
      ),
    ).rejects.toThrow('ambiguous');
  });
  it('finds a unique exact text match across pages', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ items: [], nextCursor: 'page2' })
      .mockResolvedValueOnce({ items: [candidate], nextCursor: null });
    expect(await verifyTextPublish(context, startedAt, request, now)).toBe(
      'landed',
    );
    expect(request).toHaveBeenLastCalledWith('page2');
  });

  it('confirms absence only after every page and the visibility grace', async () => {
    const request = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    expect(
      await verifyTextPublish(context, startedAt, request, now),
    ).toBeNull();
    await expect(
      verifyTextPublish(
        context,
        startedAt,
        request,
        new Date('2026-10-03T10:01:00Z'),
      ),
    ).rejects.toThrow('visibility');
  });

  it('backs off on API errors and bounded incomplete listings', async () => {
    await expect(
      verifyTextPublish(
        context,
        startedAt,
        vi.fn().mockRejectedValue(new Error('403')),
        now,
      ),
    ).rejects.toThrow('403');
    await expect(
      verifyTextPublish(
        context,
        startedAt,
        vi.fn().mockResolvedValue({ items: [], nextCursor: 'more' }),
        now,
      ),
    ).rejects.toThrow('pagination');
  });

  it('does not accept duplicate captions even when they are on different pages', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ items: [candidate], nextCursor: 'page2' })
      .mockResolvedValueOnce({
        items: [{ ...candidate, id: 'another' }],
        nextCursor: null,
      });
    await expect(
      verifyTextPublish(context, startedAt, request, now),
    ).rejects.toThrow('ambiguous');
  });

  it.each([
    { ...candidate, hasMedia: true },
    { ...candidate, isReply: true },
    { ...candidate, isQuote: true },
    { ...candidate, quoteId: 'unrequested-quote' },
    { ...candidate, createdAt: new Date('2026-10-03T10:00:00Z') },
  ])(
    'does not claim absence for a caption with unverifiable semantics',
    async (item) => {
      await expect(
        verifyTextPublish(
          context,
          startedAt,
          vi.fn().mockResolvedValue({ items: [item], nextCursor: null }),
          now,
        ),
      ).rejects.toThrow();
    },
  );

  it.each([
    { ...context, hasThreadChildren: true },
    { ...context, hasThreadChildren: undefined },
    { ...context, post: { ...context.post, quoteTweetId: 'quoted-post' } },
    { ...context, post: { ...context.post, ingredients: ['asset'] } },
    { ...context, post: { ...context.post, description: '' } },
    {
      ...context,
      post: { ...context.post, description: 'https://example.com' },
    },
    { ...context, post: { ...context.post, description: 'www.example.com' } },
    {
      ...context,
      post: { ...context.post, description: 'Visit example.com now' },
    },
  ])(
    'backs off rather than inventing media, thread, or transformed-text proof',
    async (input) => {
      const request = vi.fn();
      await expect(
        verifyTextPublish(input, startedAt, request, now),
      ).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('does not normalize whitespace or conflate older posts', async () => {
    const request = vi.fn().mockResolvedValue({
      items: [
        { ...candidate, text: 'Exact  caption' },
        { ...candidate, createdAt: new Date('2026-10-02T10:00:00Z') },
      ],
      nextCursor: null,
    });
    expect(
      await verifyTextPublish(context, startedAt, request, now),
    ).toBeNull();
  });
});
