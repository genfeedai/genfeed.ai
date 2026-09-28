import type { IPlatformComparison } from '@genfeedai/contracts/interfaces';
import { createEntityAttributes } from '@genfeedai/helpers';
import { analyticsPlatformAttributes } from '@serializers/attributes/common/analytics-platform.attributes';
import { AnalyticsPlatformSerializer } from '@serializers/server/common/analytics.serializer';
import { describe, expect, it } from 'vitest';

type Document = { data: Array<{ attributes: Record<string, unknown> }> };

// Adding a field to `IPlatformComparison` fails to compile here until the
// serializer whitelist and this pin are updated together (#5419).
const CONTRACT_FIELDS: Record<keyof IPlatformComparison, true> = {
  avgViewsPerPost: true,
  comments: true,
  engagementRate: true,
  likes: true,
  platform: true,
  postCount: true,
  saves: true,
  shares: true,
  totalEngagement: true,
  views: true,
};

describe('AnalyticsPlatformSerializer', () => {
  it('whitelists exactly the IPlatformComparison fields', () => {
    const entityBase = createEntityAttributes([]);
    expect(
      analyticsPlatformAttributes
        .filter((field) => !entityBase.includes(field))
        .sort(),
    ).toEqual(Object.keys(CONTRACT_FIELDS).sort());
  });

  it('serializes every metric of each platform row', () => {
    const row: IPlatformComparison = {
      avgViewsPerPost: 100,
      comments: 20,
      engagementRate: 10,
      likes: 40,
      platform: 'youtube',
      postCount: 3,
      saves: 5,
      shares: 10,
      totalEngagement: 75,
      views: 300,
    };

    const document = AnalyticsPlatformSerializer.serialize([row]) as Document;

    expect(document.data).toHaveLength(1);
    expect(document.data[0].attributes).toEqual(row);
  });
});
