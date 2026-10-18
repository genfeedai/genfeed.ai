import { describe, expect, it } from 'vitest';
import {
  describePlatformTextLimit,
  getPlatformTextLimit,
  isWeightedPlatformLength,
  measurePlatformText,
} from './platform-text-length.helper';

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

  it('reads the limit from the channel capability catalog', () => {
    expect(getPlatformTextLimit('twitter')).toBe(280);
    expect(getPlatformTextLimit('not-a-platform')).toBeUndefined();
    expect(isWeightedPlatformLength('twitter')).toBe(true);
    expect(isWeightedPlatformLength('threads')).toBe(false);
  });

  it('describes the X limit with its weighting rules for prompts', () => {
    expect(describePlatformTextLimit('twitter')).toContain(
      '280 characters max',
    );
    expect(describePlatformTextLimit('twitter')).toContain('link counts 23');
    expect(describePlatformTextLimit('linkedin')).toBe('3000 characters max');
    expect(describePlatformTextLimit('not-a-platform')).toBeUndefined();
    expect(describePlatformTextLimit('linkedin', 1200)).toBe(
      '1200 characters max',
    );
  });
});
