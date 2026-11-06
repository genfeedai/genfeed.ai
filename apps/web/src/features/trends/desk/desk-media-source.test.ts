import { describe, expect, it } from 'vitest';
import {
  getDeskMediaAspectRatio,
  getDeskMediaSource,
  hasDeskMedia,
} from '@/features/trends/desk/desk-media-source';
import type { DiscoveryDeskItem } from '@/features/trends/props/discovery-desk.props';

function item(values: Partial<DiscoveryDeskItem>): DiscoveryDeskItem {
  return { contentType: 'video', ...values } as DiscoveryDeskItem;
}

describe('Discovery media resolution', () => {
  it('uses the thumbnail rather than the YouTube watch URL as an image', () => {
    const preview = getDeskMediaSource(
      item({
        mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      }),
    );
    expect(preview.thumbnail).toContain('i.ytimg.com');
    expect(preview.directUrl).toBeNull();
    expect(preview.embedUrl).toContain('autoplay=1&mute=1');
  });
  it.each([
    'https://youtu.be/dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://youtube.com/live/dQw4w9WgXcQ',
  ])('supports YouTube URL forms: %s', (sourceUrl) => {
    expect(getDeskMediaSource(item({ sourceUrl })).embedUrl).toContain(
      '/embed/dQw4w9WgXcQ',
    );
  });
  it('plays TikTok muted inline', () => {
    expect(
      getDeskMediaSource(
        item({
          sourceUrl:
            'https://www.tiktok.com/@creator/video/6718335390845095173',
        }),
      ).embedUrl,
    ).toContain('autoplay=1&muted=1');
  });
  it.each([
    'instagram',
    'twitter',
    'linkedin',
    'reddit',
    'facebook',
    'pinterest',
  ])('uses native media for %s when collected media exists', (platform) => {
    expect(
      getDeskMediaSource(
        item({
          platform,
          mediaUrl: 'https://cdn.example.com/video.mp4',
          sourceUrl: `https://${platform}.com/post/123`,
        }),
      ).directUrl,
    ).toBe('https://cdn.example.com/video.mp4');
  });
  it('retains a thumbnail preview for unsupported social page URLs', () => {
    const preview = getDeskMediaSource(
      item({
        mediaUrl: 'https://www.instagram.com/reel/123',
        thumbnailUrl: 'https://cdn.example.com/poster.jpg',
      }),
    );
    expect(preview).toEqual({
      directUrl: null,
      embedUrl: null,
      thumbnail: 'https://cdn.example.com/poster.jpg',
    });
  });
  it('rejects unsafe media and does not mistake lookalike hosts for providers', () => {
    expect(
      getDeskMediaSource(
        item({
          mediaUrl: 'javascript:alert(1)',
          sourceUrl: 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
        }),
      ).embedUrl,
    ).toBeNull();
  });
  it('preserves image previews', () => {
    expect(
      getDeskMediaSource(
        item({
          contentType: 'image',
          mediaUrl: 'https://cdn.example.com/image.jpg',
        }),
      ).thumbnail,
    ).toBe('https://cdn.example.com/image.jpg');
  });
  it('derives the YouTube poster when the signal stored none', () => {
    expect(
      getDeskMediaSource(
        item({ sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      ).thumbnail,
    ).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });
  it.each([
    ['tiktok', 'https://www.tiktok.com/@creator/video/1', '9 / 16'],
    ['instagram', 'https://www.instagram.com/reel/abc/', '9 / 16'],
    ['youtube', 'https://youtube.com/shorts/dQw4w9WgXcQ', '9 / 16'],
    ['youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', '16 / 9'],
    ['twitter', 'https://x.com/creator/status/1', '16 / 9'],
  ])('frames %s video %s as %s', (platform, sourceUrl, ratio) => {
    expect(getDeskMediaAspectRatio(item({ platform, sourceUrl }))).toBe(ratio);
  });
  it('lets an image keep its own ratio', () => {
    expect(
      getDeskMediaAspectRatio(item({ contentType: 'image', platform: 'x' })),
    ).toBeNull();
  });
  it.each([
    [{ contentType: 'tweet', sourceUrl: 'https://x.com/a/status/1' }, false],
    [{ contentType: 'post', platform: 'reddit' }, false],
    [{ contentType: 'image', mediaUrl: 'https://cdn.example.com/a.jpg' }, true],
    [{ sourceUrl: 'https://www.tiktok.com/@creator/video/1' }, true],
  ] as const)('treats %o as media: %s', (values, expected) => {
    expect(hasDeskMedia(item(values))).toBe(expected);
  });
});
