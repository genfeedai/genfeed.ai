import {
  BREAKOUT_CAROUSEL_PARTS,
  type BreakoutMediaFormat,
  isBreakoutMediaFormat,
  resolveBreakoutMediaFormat,
} from '@api/collections/outliers/services/breakout-media-format.util';
import { ModelCategory, PostCategory } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const FORMATS: BreakoutMediaFormat[] = ['image', 'carousel', 'video', 'short'];

describe('breakout media format capability', () => {
  // The expected matrix mirrors the channel capability catalog the scheduler validates against.
  const supported: Record<string, BreakoutMediaFormat[]> = {
    youtube: ['video', 'short'],
    tiktok: ['video', 'short'],
    instagram: ['image', 'carousel', 'video', 'short'],
    twitter: ['image', 'carousel', 'video'],
    linkedin: ['image', 'video'],
    beehiiv: [],
  };

  it.each(
    Object.entries(supported).flatMap(([platform, formats]) =>
      FORMATS.map((format) => ({
        platform,
        format,
        isSupported: formats.includes(format),
      })),
    ),
  )(
    '$platform $format supported=$isSupported',
    ({ platform, format, isSupported }) => {
      const result = resolveBreakoutMediaFormat(platform, format);
      if (isSupported) expect(result.status).toBe('supported');
      else
        expect(result).toEqual({
          status: 'held',
          reason: 'format_unsupported_for_platform',
        });
    },
  );

  it.each([
    'facebook',
    'pinterest',
    'reddit',
    'mastodon',
    'threads',
    'medium',
    'not-a-platform',
  ])(
    'holds %s as a platform the scheduler does not publish for',
    (platform) => {
      for (const format of FORMATS)
        expect(resolveBreakoutMediaFormat(platform, format)).toEqual({
          status: 'held',
          reason: 'platform_publishing_unavailable',
        });
    },
  );

  it('never treats a text format as a visual format', () => {
    expect(isBreakoutMediaFormat('text')).toBe(false);
    expect(isBreakoutMediaFormat('thread')).toBe(false);
    expect(resolveBreakoutMediaFormat('instagram', 'text')).toEqual({
      status: 'held',
      reason: 'format_unsupported_for_platform',
    });
  });

  it('derives the generation, post and shape from the format', () => {
    const plan = (platform: string, format: BreakoutMediaFormat) => {
      const result = resolveBreakoutMediaFormat(platform, format);
      if (result.status !== 'supported') throw new Error('expected support');
      return result.plan;
    };
    expect(plan('instagram', 'image')).toMatchObject({
      modelCategory: ModelCategory.IMAGE,
      mediaKind: 'image',
      parts: 1,
      postCategory: PostCategory.IMAGE,
      aspectRatio: '1:1',
      durationSeconds: null,
    });
    expect(plan('instagram', 'carousel')).toMatchObject({
      modelCategory: ModelCategory.IMAGE,
      parts: BREAKOUT_CAROUSEL_PARTS,
      postCategory: PostCategory.IMAGE,
    });
    expect(plan('youtube', 'video')).toMatchObject({
      modelCategory: ModelCategory.VIDEO,
      mediaKind: 'video',
      parts: 1,
      postCategory: PostCategory.VIDEO,
      aspectRatio: '16:9',
    });
    const short = plan('tiktok', 'short');
    expect(short).toMatchObject({
      postCategory: PostCategory.REEL,
      aspectRatio: '9:16',
    });
    expect(short.durationSeconds).toBeGreaterThan(0);
    expect(short.height).toBeGreaterThan(short.width);
  });
});
