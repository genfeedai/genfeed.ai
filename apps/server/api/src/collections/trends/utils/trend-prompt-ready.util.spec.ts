import type { TrendSourceReferenceRecord } from '@api/collections/trends/interfaces/trend.interfaces';

import {
  hasPromptReadyIdentity,
  isTrendPromptReady,
} from './trend-prompt-ready.util';

const reference: TrendSourceReferenceRecord = {
  canonicalUrl: 'https://example.com/reference',
  contentType: 'video',
  currentEngagementTotal: 1200,
  firstSeenAt: '2026-06-01T00:00:00.000Z',
  id: 'reference_1',
  lastSeenAt: '2026-06-12T00:00:00.000Z',
  latestTrendMentions: 300,
  latestTrendViralityScore: 91,
  matchedTrendTopics: ['ai tools'],
  platform: 'tiktok',
  remixCount: 0,
  sourceClassification: {
    capturedAt: '2026-06-01T00:00:00.000Z',
    confidence: 'medium',
    freshnessWindowDays: 2,
    intendedUse: 'organic_trend_discovery',
    sourceKind: 'public_platform_reference',
    sourceLabel: 'TikTok',
    sourceTopic: 'ai tools',
  },
  sourcePreviewState: 'live',
  title: 'AI tools clip',
};

describe('trend prompt readiness', () => {
  it('requires non-empty identity fields', () => {
    expect(hasPromptReadyIdentity(reference)).toBe(true);
    expect(hasPromptReadyIdentity({ ...reference, canonicalUrl: '' })).toBe(
      false,
    );
    expect(hasPromptReadyIdentity({ ...reference, platform: '' })).toBe(false);
    expect(hasPromptReadyIdentity({ ...reference, contentType: '' })).toBe(
      false,
    );
  });

  it('requires matching intent, finite engagement, and a label', () => {
    expect(
      isTrendPromptReady(reference, 'organic_trend_discovery', 'AI tools clip'),
    ).toBe(true);
    expect(
      isTrendPromptReady(reference, 'paid_creative_analysis', 'AI tools clip'),
    ).toBe(false);
    expect(
      isTrendPromptReady(
        { ...reference, currentEngagementTotal: Number.NaN },
        'organic_trend_discovery',
        'AI tools clip',
      ),
    ).toBe(false);
    expect(isTrendPromptReady(reference, 'organic_trend_discovery', '')).toBe(
      false,
    );
  });
});
