import { compareCampaignEntries } from '@api/collections/campaigns/services/campaign-comparison';
import { rollupCampaignMetric } from '@api/collections/campaigns/services/campaign-performance.service';
import { UNIFIED_PAUSED_CAMPAIGN_STATUS } from '@api/services/ads-gateway/ads-campaign-status.util';
import {
  ContentCampaignPaidActivationStatus,
  ContentCampaignStatus,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('Campaign delivery journey', () => {
  it('keeps missing organic metrics unavailable instead of zero', () => {
    expect(rollupCampaignMetric(4, [])).toEqual({
      availablePostCount: 0,
      totalPostCount: 4,
      value: null,
    });
    expect(rollupCampaignMetric(4, [0]).value).toBe(0);
  });

  it('refuses a comparison winner when organic data is incomplete', () => {
    const result = compareCampaignEntries(
      [
        {
          campaign: {
            brandId: 'brand-1',
            id: 'a',
            name: 'A',
            organizationId: 'org-1',
            status: ContentCampaignStatus.ACTIVE,
            userId: 'user-1',
          },
          organic: {
            clicks: { availablePostCount: 0, totalPostCount: 1, value: null },
            comments: { availablePostCount: 0, totalPostCount: 1, value: null },
            conversions: {
              availablePostCount: 0,
              totalPostCount: 1,
              value: null,
            },
            engagements: {
              availablePostCount: 0,
              totalPostCount: 1,
              value: null,
            },
            likes: { availablePostCount: 0, totalPostCount: 1, value: null },
            saves: { availablePostCount: 0, totalPostCount: 1, value: null },
            shares: { availablePostCount: 0, totalPostCount: 1, value: null },
            views: { availablePostCount: 0, totalPostCount: 1, value: null },
          },
          windowEnd: '2026-09-02T23:59:59.999Z',
          windowStart: '2026-08-26T00:00:00.000Z',
        },
        {
          campaign: {
            brandId: 'brand-1',
            id: 'b',
            name: 'B',
            organizationId: 'org-1',
            status: ContentCampaignStatus.ACTIVE,
            userId: 'user-1',
          },
          organic: {
            clicks: { availablePostCount: 0, totalPostCount: 1, value: null },
            comments: { availablePostCount: 1, totalPostCount: 1, value: 1 },
            conversions: {
              availablePostCount: 0,
              totalPostCount: 1,
              value: null,
            },
            engagements: { availablePostCount: 1, totalPostCount: 1, value: 1 },
            likes: { availablePostCount: 1, totalPostCount: 1, value: 1 },
            saves: { availablePostCount: 1, totalPostCount: 1, value: 0 },
            shares: { availablePostCount: 1, totalPostCount: 1, value: 0 },
            views: { availablePostCount: 1, totalPostCount: 1, value: 12 },
          },
          windowEnd: '2026-09-02T23:59:59.999Z',
          windowStart: '2026-08-26T00:00:00.000Z',
        },
      ],
      'views',
    );

    expect(result.winnerCampaignId).toBeNull();
    expect(result.isDescriptive).toBe(true);
  });

  it('keeps paid activation preparation paused', () => {
    expect(UNIFIED_PAUSED_CAMPAIGN_STATUS).toBe('PAUSED');
    expect(ContentCampaignPaidActivationStatus.PAUSED).toBe('paused');
  });
});
