import { compareCampaignEntries } from '@api/collections/campaigns/services/campaign-comparison';
import { ContentCampaignStatus } from '@genfeedai/contracts';
import type { ICampaignComparisonEntry } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

function emptyOrganic(value: number | null) {
  const metric = {
    availablePostCount: value === null ? 0 : 1,
    totalPostCount: 1,
    value,
  };
  return {
    clicks: { availablePostCount: 0, totalPostCount: 1, value: null },
    comments: metric,
    conversions: { availablePostCount: 0, totalPostCount: 1, value: null },
    engagements: metric,
    likes: metric,
    saves: metric,
    shares: metric,
    views: metric,
  };
}

function entry(
  id: string,
  views: number | null,
  objective = 'reach',
): ICampaignComparisonEntry {
  return {
    campaign: {
      brandId: 'brand-1',
      id,
      name: id,
      objective,
      organizationId: 'org-1',
      status: ContentCampaignStatus.ACTIVE,
      userId: 'user-1',
    },
    organic: emptyOrganic(views),
    windowEnd: '2026-09-02T23:59:59.999Z',
    windowStart: '2026-08-26T00:00:00.000Z',
  };
}

describe('compareCampaignEntries', () => {
  it('does not declare a winner when a metric is unavailable', () => {
    const result = compareCampaignEntries([entry('a', 10), entry('b', null)]);
    expect(result.winnerCampaignId).toBeNull();
    expect(result.reason).toMatch(/missing compatible organic data/i);
  });

  it('ranks compatible organic views descriptively', () => {
    const result = compareCampaignEntries([entry('a', 10), entry('b', 40)]);
    expect(result.winnerCampaignId).toBe('b');
    expect(result.isDescriptive).toBe(true);
    expect(result.reason).toMatch(/not causal lift/i);
  });

  it('refuses a winner when reporting windows differ', () => {
    const left = entry('a', 10);
    const right = {
      ...entry('b', 40),
      windowStart: '2026-01-01T00:00:00.000Z',
    };
    expect(compareCampaignEntries([left, right]).winnerCampaignId).toBeNull();
  });
});
