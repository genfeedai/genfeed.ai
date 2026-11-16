import {
  parseFacebookFeedVerificationPage,
  parseInstagramMediaVerificationPage,
} from '@api/services/integrations/publishers/publisher-media-verification-pages.util';
import { describe, expect, it } from 'vitest';

describe('parseInstagramMediaVerificationPage', () => {
  const media = {
    caption: 'Exact caption',
    id: '1790',
    media_product_type: 'FEED',
    media_type: 'IMAGE',
    permalink: 'https://www.instagram.com/p/ABC/',
    shortcode: 'ABC',
    timestamp: '2026-10-03T10:00:03+0000',
  };

  it('reads an image, a reel and a carousel with its item count', () => {
    const page = parseInstagramMediaVerificationPage({
      data: [
        media,
        {
          ...media,
          id: '1791',
          media_type: 'VIDEO',
          media_product_type: 'REELS',
        },
        {
          ...media,
          children: { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
          id: '1792',
          media_type: 'CAROUSEL_ALBUM',
        },
      ],
    });
    expect(
      page.items.map(({ id, mediaCount, mediaKind, shortcode, url }) => ({
        id,
        mediaCount,
        mediaKind,
        shortcode,
        url,
      })),
    ).toEqual([
      {
        id: '1790',
        mediaCount: 1,
        mediaKind: 'image',
        shortcode: 'ABC',
        url: 'https://www.instagram.com/p/ABC/',
      },
      {
        id: '1791',
        mediaCount: 1,
        mediaKind: 'video',
        shortcode: 'ABC',
        url: 'https://www.instagram.com/p/ABC/',
      },
      {
        id: '1792',
        mediaCount: 3,
        mediaKind: 'carousel',
        shortcode: 'ABC',
        url: 'https://www.instagram.com/p/ABC/',
      },
    ]);
    expect(page.items[0]?.createdAt.toISOString()).toBe(
      '2026-10-03T10:00:03.000Z',
    );
    expect(page.nextCursor).toBeNull();
  });

  it('treats a missing caption as empty and follows the next cursor', () => {
    const { caption: _caption, ...withoutCaption } = media;
    const page = parseInstagramMediaVerificationPage({
      data: [withoutCaption],
      paging: { cursors: { after: 'cursor-2' }, next: 'https://graph/next' },
    });
    expect(page.items[0]?.text).toBe('');
    expect(page.nextCursor).toBe('cursor-2');
  });

  it.each([
    ['a provider error', { data: [], error: { message: 'boom' } }],
    [
      'a carousel without its children',
      { data: [{ ...media, media_type: 'CAROUSEL_ALBUM' }] },
    ],
    [
      'an item without a timestamp',
      { data: [{ ...media, timestamp: undefined }] },
    ],
    [
      'an item without a permalink',
      { data: [{ ...media, permalink: undefined }] },
    ],
    [
      'a next link without a cursor',
      { data: [], paging: { next: 'https://graph/next' } },
    ],
  ])('rejects %s as incomplete evidence', (_name, body) => {
    expect(() => parseInstagramMediaVerificationPage(body)).toThrow();
  });
});

describe('parseFacebookFeedVerificationPage', () => {
  const post = {
    attachments: { data: [{ media_type: 'photo', target: { id: 'photo-1' } }] },
    created_time: '2026-10-03T10:00:03+0000',
    id: '123_456',
    is_published: true,
    message: 'Exact caption',
    permalink_url: 'https://www.facebook.com/123/posts/456',
  };

  it('reads a photo post by its feed id and a video post by its video id', () => {
    const page = parseFacebookFeedVerificationPage({
      data: [
        post,
        {
          ...post,
          attachments: {
            data: [{ media_type: 'video', target: { id: 'video-9' } }],
          },
          id: '123_457',
        },
      ],
    });
    expect(page.items.map(({ id, mediaKind }) => ({ id, mediaKind }))).toEqual([
      { id: '123_456', mediaKind: 'image' },
      { id: 'video-9', mediaKind: 'video' },
    ]);
    expect(page.items[0]?.createdAt.toISOString()).toBe(
      '2026-10-03T10:00:03.000Z',
    );
  });

  it('skips unpublished posts and reads text-only or link posts as other media', () => {
    const page = parseFacebookFeedVerificationPage({
      data: [
        { ...post, id: '123_1', is_published: false },
        { ...post, attachments: undefined, id: '123_2' },
        {
          ...post,
          attachments: { data: [{ media_type: 'link' }] },
          id: '123_3',
        },
      ],
      paging: { cursors: { after: 'next-page' }, next: 'https://graph/next' },
    });
    expect(page.items.map(({ id, mediaKind }) => ({ id, mediaKind }))).toEqual([
      { id: '123_2', mediaKind: 'other' },
      { id: '123_3', mediaKind: 'other' },
    ]);
    expect(page.nextCursor).toBe('next-page');
  });

  it.each([
    ['a post without published evidence', { ...post, is_published: undefined }],
    [
      'a video without its attachment target',
      { ...post, attachments: { data: [{ media_type: 'video' }] } },
    ],
    ['a post without a timestamp', { ...post, created_time: undefined }],
  ])('rejects %s as incomplete evidence', (_name, entry) => {
    expect(() =>
      parseFacebookFeedVerificationPage({ data: [entry] }),
    ).toThrow();
  });
});
