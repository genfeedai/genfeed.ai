import { describe, expect, it } from 'vitest';
import {
  checkpointValidity,
  learningCapability,
} from '../../src/learning/capabilities';
import { computeLearningReward } from '../../src/learning/reward';

describe('experimental account-relative reward', () => {
  const baseline = Array.from({ length: 20 }, () => ({
    exposure: 1000,
    weightedActions: 100,
  }));
  it('reports 10x and 0.5x exposure while preserving equal quality rates', () => {
    const high = computeLearningReward(
      { exposure: 10000, weightedActions: 1000 },
      baseline,
      'engagement',
    );
    const low = computeLearningReward(
      { exposure: 500, weightedActions: 50 },
      baseline,
      'engagement',
    );
    expect(high.exposureRatio).toBe(10);
    expect(low.exposureRatio).toBe(0.5);
    expect(high.quality).toBe(0);
    expect(low.quality).toBe(0);
    expect(high.composite).toBeCloseTo(0.3);
    expect(low.composite).toBeCloseTo(-0.3);
  });
  it('abstains before twenty contributors and at low exposure', () => {
    expect(
      computeLearningReward(
        { exposure: 1000, weightedActions: 0 },
        baseline.slice(1),
        'engagement',
      ).status,
    ).toBe('insufficient_baseline');
    const result = computeLearningReward(
      { exposure: 99, weightedActions: 0 },
      baseline,
      'engagement',
    );
    expect(result.status).toBe('low_exposure');
    expect(result.composite).toBeUndefined();
    expect(result.distribution).toBe(-1);
  });
  it('keeps observed zero distinct from unsupported metrics and does not renormalize masks', () => {
    expect(
      learningCapability('instagram', 'image', 'engagement', [
        'exposure',
        'likes',
        'comments',
      ]),
    ).toBeNull();
    expect(
      learningCapability('youtube', 'video', 'engagement', [
        'exposure',
        'likes',
        'comments',
      ])?.mask,
    ).toBe('LC');
    expect(
      learningCapability('mastodon', 'text', 'awareness', ['exposure']),
    ).toBeNull();
    expect(
      computeLearningReward(
        { exposure: 1000, weightedActions: 0 },
        baseline,
        'engagement',
      ).quality,
    ).toBe(-1);
  });
  it('rejects stale, future, late and slow checkpoint responses at inclusive boundaries', () => {
    const publishedAt = new Date('2026-01-01T00:00:00Z');
    const requestStartedAt = new Date('2026-01-03T00:00:00Z');
    expect(
      checkpointValidity({
        publishedAt,
        requestStartedAt,
        receivedAt: new Date('2026-01-03T00:02:00Z'),
      }),
    ).toBeNull();
    expect(
      checkpointValidity({
        publishedAt,
        requestStartedAt,
        receivedAt: new Date('2026-01-03T00:02:01Z'),
      }),
    ).toBe('delayed');
    expect(
      checkpointValidity({
        publishedAt,
        requestStartedAt,
        receivedAt: requestStartedAt,
        providerAsOf: new Date('2026-01-02T22:59:59Z'),
      }),
    ).toBe('delayed');
  });
});
