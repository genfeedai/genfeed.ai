import { OutlierBaselineSnapshotSerializer } from '@serializers/server/social/outlier-baseline-snapshot.serializer';
import { OutlierConfigurationSerializer } from '@serializers/server/social/outlier-configuration.serializer';
import { OutlierPostPerformanceSerializer } from '@serializers/server/social/outlier-post-performance.serializer';
import { describe, expect, it } from 'vitest';

type Document = { data: { attributes: Record<string, unknown> } };
describe('outlier serializer boundary', () => {
  it('exposes null ratios and provenance without raw provider payload', () => {
    const result = OutlierPostPerformanceSerializer.serialize({
      id: 'p',
      outlierRatio: null,
      outlierTier: null,
      views: null,
      baselineSnapshotId: 's',
      eligibility: 'excluded',
      exclusionReasons: ['invalid_views'],
      isPinnedUnknown: true,
      isPromotedUnknown: true,
      raw: { token: 'private' },
      credential: { accessToken: 'private' },
    }) as Document;
    expect(result.data.attributes).toMatchObject({
      outlierRatio: null,
      outlierTier: null,
      views: null,
      baselineSnapshotId: 's',
      eligibility: 'excluded',
      exclusionReasons: ['invalid_views'],
      isPinnedUnknown: true,
      isPromotedUnknown: true,
    });
    expect(result.data.attributes).not.toHaveProperty('raw');
    expect(result.data.attributes).not.toHaveProperty('credential');
  });
  it('exposes historical options but not persistence hashes', () => {
    const result = OutlierBaselineSnapshotSerializer.serialize({
      id: 's',
      medianViews: null,
      windowSize: 20,
      maturityMs: 172800000,
      contributorIds: [],
      exclusions: [],
      unknownEligibility: [],
      inputFingerprint: 'private',
      idempotencyKey: 'private',
    }) as Document;
    expect(result.data.attributes).toMatchObject({
      medianViews: null,
      windowSize: 20,
      contributorIds: [],
    });
    expect(result.data.attributes).not.toHaveProperty('inputFingerprint');
    expect(result.data.attributes).not.toHaveProperty('idempotencyKey');
  });
  it('exposes resolved configuration', () => {
    const result = OutlierConfigurationSerializer.serialize({
      id: 'c',
      windowSize: 10,
      minimumSampleSize: 5,
      maturityHoursByPlatform: { twitter: 0 },
    }) as Document;
    expect(result.data.attributes).toMatchObject({
      windowSize: 10,
      minimumSampleSize: 5,
      maturityHoursByPlatform: { twitter: 0 },
    });
  });
});
