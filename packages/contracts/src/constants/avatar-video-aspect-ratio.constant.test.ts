import { describe, expect, it } from 'vitest';
import { resolveAvatarVideoAspectRatio } from './avatar-video-aspect-ratio.constant';

describe('resolveAvatarVideoAspectRatio', () => {
  it('lets an explicit ratio override the platform', () => {
    expect(
      resolveAvatarVideoAspectRatio({ aspectRatio: '1:1', platform: 'tiktok' }),
    ).toBe('1:1');
  });

  it('picks portrait for short-form placements', () => {
    for (const platform of [
      'tiktok',
      'instagram',
      'Instagram Reels',
      'YouTube Shorts',
      'facebook stories',
    ]) {
      expect(resolveAvatarVideoAspectRatio({ platform })).toBe('9:16');
    }
  });

  it('picks landscape for X and YouTube', () => {
    expect(resolveAvatarVideoAspectRatio({ platform: 'twitter' })).toBe('16:9');
    expect(resolveAvatarVideoAspectRatio({ platform: 'youtube' })).toBe('16:9');
  });

  it('falls back to portrait for unknown input', () => {
    expect(resolveAvatarVideoAspectRatio({})).toBe('9:16');
    expect(
      resolveAvatarVideoAspectRatio({ aspectRatio: '4:3', platform: 'mars' }),
    ).toBe('9:16');
  });
});
