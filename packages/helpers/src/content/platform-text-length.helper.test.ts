import { describe, expect, it } from 'vitest';
import {
  describePlatformTextLimit,
  getPlatformTextLimit,
} from './platform-text-length.helper';

describe('platform text length', () => {
  it('reads the limit from the channel capability catalog', () => {
    expect(getPlatformTextLimit('twitter')).toBe(280);
    expect(getPlatformTextLimit('bluesky')).toBe(300);
    expect(getPlatformTextLimit('not-a-platform')).toBeUndefined();
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
