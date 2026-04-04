import { describe, expect, it } from 'vitest';
import {
  ALL_TREND_PLATFORMS,
  CURATED_TREND_PLATFORMS,
  getNewestTrendByCreatedAt,
  getTrendPlatformLabel,
  isTrendPlatform,
  REALTIME_TREND_PLATFORMS,
} from './trends-platforms';

describe('trends-platforms', () => {
  it('keeps platform groupings stable', () => {
    expect(REALTIME_TREND_PLATFORMS).toContain('tiktok');
    expect(CURATED_TREND_PLATFORMS).toEqual(['linkedin']);
    expect(ALL_TREND_PLATFORMS).toContain('youtube');
  });

  it('validates platform names and labels', () => {
    expect(isTrendPlatform('reddit')).toBe(true);
    expect(isTrendPlatform('threads')).toBe(false);
    expect(getTrendPlatformLabel('twitter')).toBe('X');
  });

  it('finds the newest trend by created date', () => {
    expect(
      getNewestTrendByCreatedAt([
        { createdAt: '2026-03-01T00:00:00.000Z', id: '1' },
        { createdAt: '2026-03-05T00:00:00.000Z', id: '2' },
      ] as never),
    ).toMatchObject({ id: '2' });
  });
});
