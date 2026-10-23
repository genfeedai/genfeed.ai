import {
  buildAdsResearchAdPack,
  buildAdsResearchExplanation,
  mapConnectedResearchItem,
  normalizeAdsResearchPlatform,
} from '@api/endpoints/ads-research/ads-research-presentation.util';
import { AdsChannel, AdsPlatform } from '@genfeedai/contracts/interfaces';
import type { AdsResearchDetail } from '@genfeedai/contracts/interfaces/integrations/ads-research.interface';
import { describe, expect, it } from 'vitest';

const connectedInput: Parameters<typeof mapConnectedResearchItem>[0] = {
  adAccountId: 'account-1',
  credentialId: 'credential-1',
  platform: AdsPlatform.TIKTOK,
  sourceId: 'ad-1',
};

function detail(overrides: Partial<AdsResearchDetail> = {}): AdsResearchDetail {
  return {
    channel: AdsChannel.ALL,
    creative: {},
    explanation: 'Example creative',
    id: 'ad-1',
    metrics: {},
    platform: AdsPlatform.META,
    source: 'public',
    sourceId: 'source-1',
    title: 'Example ad',
    ...overrides,
  };
}

describe('normalizeAdsResearchPlatform', () => {
  it.each([
    [' META ', AdsPlatform.META],
    ['facebook', AdsPlatform.META],
    ['meta_ads', AdsPlatform.META],
    [' GOOGLE ', AdsPlatform.GOOGLE],
    ['google_ads', AdsPlatform.GOOGLE],
    ['google-ads', AdsPlatform.GOOGLE],
    ['tiktok', AdsPlatform.TIKTOK],
    [' TIKTOK_ADS ', AdsPlatform.TIKTOK],
    ['x', AdsPlatform.X],
    ['x_ads', AdsPlatform.X],
    [' TWITTER ', AdsPlatform.X],
  ])('maps stored platform %s to %s', (stored, expected) => {
    expect(normalizeAdsResearchPlatform(stored)).toBe(expected);
  });

  it('preserves an unknown storage value verbatim', () => {
    expect(normalizeAdsResearchPlatform(' Future_Platform ')).toBe(
      ' Future_Platform ',
    );
  });
});

describe('mapConnectedResearchItem', () => {
  it('keeps absent metrics and creative absent while retaining account identity', () => {
    const item = mapConnectedResearchItem(connectedInput);

    expect(item).toMatchObject({
      accountId: 'account-1',
      accountName: 'Connected TikTok Ads account',
      adAccountId: 'account-1',
      channel: AdsChannel.ALL,
      credentialId: 'credential-1',
      id: 'connected:tiktok:ad-1',
      imageUrls: [],
      metricLabel: 'performance',
      patternSummary: [],
      source: 'my_accounts',
      sourceId: 'ad-1',
      title: 'Connected ad',
      videoUrls: [],
    });
    expect(item.previewUrl).toBeUndefined();
    expect(item.metricValue).toBeUndefined();
    expect(
      Object.values(item.metrics).every((value) => value === undefined),
    ).toBe(true);
  });

  it('carries measured zeros, creative and the selected display metric without substitution', () => {
    const item = mapConnectedResearchItem({
      ...connectedInput,
      ad: {
        adSetId: 'ad-set-1',
        creative: {
          body: 'Offer proof',
          callToAction: 'Shop now',
          imageUrl: 'https://media.example/creative.jpg',
          linkUrl: 'https://shop.example/offer',
          title: 'A clear promise',
        },
        id: 'ad-1',
        name: 'Provider name',
        platform: AdsPlatform.TIKTOK,
        status: 'ACTIVE',
      },
      insightMetric: 'ctr',
      loginCustomerId: 'manager-1',
      metricValue: 0,
      name: 'Selected name',
      topInsights: {
        clicks: 0,
        conversions: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
        dateStart: '2026-10-01',
        dateStop: '2026-10-02',
        impressions: 0,
        revenue: 0,
        roas: 0,
        spend: 0,
      },
    });

    expect(item).toMatchObject({
      body: 'Offer proof',
      cta: 'Shop now',
      headline: 'A clear promise',
      imageUrls: ['https://media.example/creative.jpg'],
      landingPageUrl: 'https://shop.example/offer',
      loginCustomerId: 'manager-1',
      metricLabel: 'ctr',
      metricValue: 0,
      previewUrl: 'https://media.example/creative.jpg',
      status: 'ACTIVE',
      title: 'Selected name',
    });
    expect(item.metrics).toEqual({
      clicks: 0,
      conversions: 0,
      cpc: 0,
      cpm: 0,
      ctr: 0,
      impressions: 0,
      performanceScore: 0,
      revenue: 0,
      roas: 0,
      spend: 0,
    });
  });

  it.each([
    [undefined, 'video-1', AdsChannel.YOUTUBE],
    [AdsChannel.ALL, 'video-1', AdsChannel.YOUTUBE],
    [AdsChannel.DISPLAY, 'video-1', AdsChannel.DISPLAY],
    [AdsChannel.SEARCH, 'video-1', AdsChannel.SEARCH],
    [undefined, undefined, AdsChannel.SEARCH],
  ])(
    'resolves Google channel %s with video %s to %s',
    (channel, videoId, expectedChannel) => {
      const item = mapConnectedResearchItem({
        ...connectedInput,
        ad: {
          adSetId: 'set-1',
          creative: { videoId },
          id: 'ad-1',
          name: 'Provider name',
          platform: AdsPlatform.GOOGLE,
          status: 'PAUSED',
        },
        channel,
        platform: AdsPlatform.GOOGLE,
      });

      expect(item.channel).toBe(expectedChannel);
      expect(item.title).toBe('Provider name');
      expect(item.previewUrl).toBe(
        videoId ? 'https://www.youtube.com/watch?v=video-1' : undefined,
      );
      expect(item.videoUrls).toEqual(
        videoId ? ['https://www.youtube.com/watch?v=video-1'] : [],
      );
    },
  );

  it.each([AdsPlatform.GOOGLE, AdsPlatform.TIKTOK])(
    'prefers the image preview on %s and limits YouTube URLs to Google',
    (platform) => {
      const item = mapConnectedResearchItem({
        ...connectedInput,
        ad: {
          adSetId: 'set-1',
          creative: {
            imageUrl: 'https://media.example/thumbnail.jpg',
            videoId: 'video-1',
          },
          id: 'ad-1',
          name: '',
          platform,
          status: 'PAUSED',
        },
        channel: AdsChannel.DISPLAY,
        insightMetric: '',
        name: '',
        platform,
      });

      expect(item.previewUrl).toBe('https://media.example/thumbnail.jpg');
      expect(item.title).toBe('Connected ad');
      expect(item.metricLabel).toBe('performance');
      expect(item.videoUrls).toEqual(
        platform === AdsPlatform.GOOGLE
          ? ['https://www.youtube.com/watch?v=video-1']
          : [],
      );
      expect(item.channel).toBe(
        platform === AdsPlatform.GOOGLE ? AdsChannel.DISPLAY : AdsChannel.ALL,
      );
    },
  );
});

describe('buildAdsResearchAdPack', () => {
  it('keeps fallback copy and a review-required campaign recipe', () => {
    const pack = buildAdsResearchAdPack({ ad: detail() });

    expect(pack.cta).toBe('Learn more');
    expect(pack.headlines).toEqual([
      'your brand: Winning angle',
      'Why your niche buyers switch to your brand',
      'your brand without the usual your niche friction',
    ]);
    expect(pack.primaryText).toBe(
      'Strong proof-based ad copy\n\nAdapt this around your brand, make the offer concrete for your niche, and tie every line back to the conversions goal.',
    );
    expect(pack.campaignRecipe).toEqual({
      budgetStrategy:
        'Start with a paused daily budget and test 2-3 placement clusters before scale.',
      channel: AdsChannel.ALL,
      objective: 'Conversions',
      placements: ['Facebook Feed', 'Instagram Feed', 'Stories'],
      platform: AdsPlatform.META,
      reviewStatus: 'review_required',
    });
    expect(pack.assetCreativeBrief).not.toContain('BRAND HARNESS');
  });

  it('uses caller overrides, trimmed source copy and harness notes in both briefs', () => {
    const pack = buildAdsResearchAdPack({
      ad: detail({
        body: '  Proof from the source  ',
        campaignObjective: 'Traffic',
        channel: AdsChannel.SEARCH,
        cta: '  Try it  ',
        headline: '  Winning promise  ',
        industry: 'source niche',
        platform: AdsPlatform.GOOGLE,
      }),
      brandName: 'Example Brand',
      channel: AdsChannel.YOUTUBE,
      harnessNotes: 'Use verified evidence.',
      industry: 'fitness',
      objective: 'Leads',
    });

    expect(pack.headlines[0]).toBe('Example Brand: Winning promise');
    expect(pack.cta).toBe('Try it');
    expect(pack.primaryText).toBe(
      'Proof from the source\n\nAdapt this around Example Brand, make the offer concrete for fitness, and tie every line back to the leads goal.\n\nBRAND HARNESS:\nUse verified evidence.',
    );
    expect(pack.assetCreativeBrief).toContain(
      'Build a Google Ads creative for Example Brand in fitness.',
    );
    expect(
      pack.assetCreativeBrief.endsWith(
        '\n\nBRAND HARNESS:\nUse verified evidence.',
      ),
    ).toBe(true);
    expect(pack.campaignRecipe).toMatchObject({
      channel: AdsChannel.YOUTUBE,
      objective: 'Leads',
      placements: ['YouTube In-Feed', 'YouTube Shorts'],
      reviewStatus: 'review_required',
    });
    expect(pack.targetingNotes).toContain('Target fitness audiences');
  });

  it.each([
    [AdsChannel.ALL, ['Google Search']],
    [AdsChannel.SEARCH, ['Google Search']],
    [AdsChannel.DISPLAY, ['Display Network']],
    [AdsChannel.YOUTUBE, ['YouTube In-Feed', 'YouTube Shorts']],
  ])('retains Google placements for %s', (channel, placements) => {
    const pack = buildAdsResearchAdPack({
      ad: detail({
        campaignObjective: 'Traffic',
        channel,
        industry: 'education',
        platform: AdsPlatform.GOOGLE,
      }),
    });

    expect(pack.campaignRecipe).toMatchObject({
      budgetStrategy:
        'Start with a paused daily budget and validate search intent before scale.',
      channel,
      objective: 'Traffic',
      placements,
    });
    expect(pack.headlines[1]).toBe('Why education buyers switch to your brand');
  });
});

describe('buildAdsResearchExplanation', () => {
  it('retains signal precision and pattern order in the explanation', () => {
    expect(
      buildAdsResearchExplanation({
        ctr: 1.236,
        industry: 'fitness',
        patterns: [{ label: 'Proof' }, { label: 'Offer' }],
        platform: AdsPlatform.META,
        roas: 2.345,
      }),
    ).toBe(
      'This Meta Ads ad is outperforming peers in the fitness niche with a 1.24% CTR signal and 2.35x ROAS . The strongest reusable patterns here are Proof, Offer.',
    );
  });

  it.each([undefined, 0, -1, Number.NaN])(
    'omits absent or non-positive signals: %s',
    (signal) => {
      expect(
        buildAdsResearchExplanation({
          ctr: signal,
          patterns: [],
          platform: AdsPlatform.X,
          roas: signal,
        }),
      ).toBe('This X Ads ad is outperforming peers.');
    },
  );
});
