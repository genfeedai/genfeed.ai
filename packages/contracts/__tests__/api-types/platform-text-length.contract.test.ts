import { describe, expect, it } from 'vitest';
import {
  isWeightedPlatformLength,
  measurePlatformText,
} from '../../src/api-types/contracts/platform-text-length.contract';

describe('platform text length', () => {
  it('counts every X link as 23 characters whatever its length', () => {
    expect(
      measurePlatformText(
        'https://example.com/a/very/long/path/that/goes/on',
        'twitter',
      ),
    ).toBe(23);
    expect(measurePlatformText('Read https://a.co', 'twitter')).toBe(28);
  });

  it('weights emoji and CJK as two characters on X', () => {
    expect(measurePlatformText('😀', 'twitter')).toBe(2);
    expect(measurePlatformText('日本語', 'twitter')).toBe(6);
    expect(measurePlatformText('hi', 'twitter')).toBe(2);
  });

  it('counts code points on other channels, so emoji and CJK count one', () => {
    expect(measurePlatformText('😀', 'linkedin')).toBe(1);
    expect(measurePlatformText('日本語', 'linkedin')).toBe(3);
    expect(
      measurePlatformText('https://example.com/a/very/long/path', 'linkedin'),
    ).toBe(36);
  });

  it('counts graphemes on Bluesky, so a family emoji or a flag counts one', () => {
    expect(measurePlatformText('👨‍👩‍👧', 'bluesky')).toBe(1);
    expect(measurePlatformText('🇧🇪', 'bluesky')).toBe(1);
    expect(measurePlatformText('e\u0301', 'bluesky')).toBe(1);
    expect(measurePlatformText('plain text', 'bluesky')).toBe(10);
  });

  it('knows which channels count with X weighting', () => {
    expect(isWeightedPlatformLength('twitter')).toBe(true);
    expect(isWeightedPlatformLength('threads')).toBe(false);
  });
});
