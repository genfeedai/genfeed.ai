import type { AdsResearchItem } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { toAdsResearchFinding } from './research-work-surface.types';

function makeTikTokAd(source: AdsResearchItem['source']): AdsResearchItem {
  return {
    channel: 'all',
    explanation: 'Fast creator proof followed by a product reveal.',
    id: 'performance-1',
    metricValue: 94,
    metrics: { performanceScore: 94 },
    platform: 'tiktok',
    source,
    sourceId: 'ad-1',
    title: 'Creator proof winner',
  };
}

describe('toAdsResearchFinding', () => {
  it('keeps public TikTok ads distinct from Google ads', () => {
    const finding = toAdsResearchFinding(makeTikTokAd('public'));

    expect(finding.reference).toEqual({
      id: 'performance-1',
      kind: 'research-ad-public-tiktok',
    });
    expect(finding.metadata).toContainEqual({
      label: 'Platform',
      value: 'TikTok',
    });
  });

  it('keeps connected TikTok ads distinct from Google ads', () => {
    const finding = toAdsResearchFinding(makeTikTokAd('my_accounts'));

    expect(finding.reference).toEqual({
      id: 'ad-1',
      kind: 'research-ad-connected-tiktok',
    });
  });
});
