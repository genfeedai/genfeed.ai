import { CampaignPerformanceSerializer } from '@serializers/server/content/campaign-performance.serializer';
import { describe, expect, it } from 'vitest';

describe('CampaignPerformanceSerializer', () => {
  it('keeps unavailable organic totals null instead of zero', () => {
    const output = CampaignPerformanceSerializer.serialize({
      byPlatform: [],
      campaignId: 'campaign-1',
      id: 'campaign-1',
      organic: {
        clicks: { availablePostCount: 0, totalPostCount: 2, value: null },
        comments: { availablePostCount: 1, totalPostCount: 2, value: 4 },
        conversions: { availablePostCount: 0, totalPostCount: 2, value: null },
        engagements: { availablePostCount: 1, totalPostCount: 2, value: 10 },
        likes: { availablePostCount: 1, totalPostCount: 2, value: 6 },
        saves: { availablePostCount: 1, totalPostCount: 2, value: 0 },
        shares: { availablePostCount: 1, totalPostCount: 2, value: 0 },
        views: { availablePostCount: 1, totalPostCount: 2, value: 100 },
      },
      postCounts: { published: 1, draft: 1 },
      posts: [],
      windowEnd: '2026-09-02T23:59:59.999Z',
      windowStart: '2026-08-26T00:00:00.000Z',
    }) as {
      data: { attributes: Record<string, unknown>; type: string };
    };

    expect(output.data.type).toBe('campaign-performance');
    expect(output.data.attributes.organic).toEqual(
      expect.objectContaining({
        clicks: expect.objectContaining({ value: null }),
        views: expect.objectContaining({ value: 100 }),
      }),
    );
  });
});
