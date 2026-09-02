import { SocialSourcePlatform } from '@genfeedai/contracts';
import type { ISourcePost, ITrendVideo } from '@genfeedai/contracts/interfaces';
import type { TrendContentItem } from '@props/trends/trends-page.props';
import { describe, expect, it } from 'vitest';
import {
  toDeskItemFromSourcePost,
  toDeskItemFromTrend,
  toDeskItemFromViralVideo,
} from './desk-items';

function makeTrendItem(
  overrides: Partial<TrendContentItem> = {},
): TrendContentItem {
  return {
    authorHandle: 'builderx',
    contentRank: 1,
    contentType: 'tweet',
    id: 'twitter-source-1',
    matchedTrends: ['#AIAgents'],
    metrics: { likes: 120 },
    platform: 'twitter',
    requiresAuth: false,
    sourcePreviewState: 'live',
    sourceUrl: 'https://x.com/builderx/status/1',
    text: 'AI agents are getting embedded directly into content workflows.',
    title: 'AI agents are getting embedded directly into content workflows',
    trendId: 'twitter-1',
    trendMentions: 20000,
    trendTopic: '#AIAgents',
    trendViralityScore: 90,
    ...overrides,
  } as TrendContentItem;
}

function makeSourcePost(overrides: Partial<ISourcePost> = {}): ISourcePost {
  return {
    authorHandle: 'builder',
    contentType: 'tweet',
    externalId: 'ext-1',
    id: 'post-1',
    mediaUrls: [],
    metrics: { comments: 4, likes: 120, shares: 2, views: 5000 },
    platform: SocialSourcePlatform.TWITTER,
    publishedAt: '2026-08-01T10:00:00.000Z',
    sourceUrl: 'https://x.com/builder/status/1',
    text: 'Agents are eating the content stack.',
    thumbnailUrl: null,
    ...overrides,
  } as ISourcePost;
}

function makeViralVideo(overrides: Partial<ITrendVideo> = {}): ITrendVideo {
  return {
    creatorHandle: 'shortmaker',
    engagementRate: 0.12,
    id: 'video-1',
    likes: 800,
    platform: 'tiktok',
    publishedAt: '2026-08-01T10:00:00.000Z',
    shares: 40,
    title: 'AI shorts are spiking',
    topic: '#ShortFormAI',
    velocity: 5,
    viewCount: 12000,
    viralScore: 87,
    ...overrides,
  } as ITrendVideo;
}

describe('toDeskItemFromTrend', () => {
  it('maps a trend content item into a desk item with a stable key', () => {
    const result = toDeskItemFromTrend(makeTrendItem());

    expect(result.key).toBe('trend:twitter-source-1');
    expect(result.kind).toBe('trend');
    expect(result.source).toBe('trends');
    expect(result.engagement).toBe(120);
    expect(result.virality).toBe(90);
    expect(result.matchedTrends).toEqual(['#AIAgents']);
  });

  it('marks owned-brand-reference items as source "owned"', () => {
    const result = toDeskItemFromTrend(
      makeTrendItem({
        sourceClassification: {
          capturedAt: '2026-08-01T00:00:00.000Z',
          confidence: 1,
          freshnessWindowDays: 30,
          intendedUse: 'reference',
          sourceKind: 'owned_brand_reference',
        },
      }),
    );

    expect(result.source).toBe('owned');
  });

  it('opens the prefilled remix for a durable-reference item on a prefilled platform', () => {
    const result = toDeskItemFromTrend(
      makeTrendItem({
        platform: 'instagram',
        sourceReferenceId: 'ref-1',
      }),
    );

    expect(result.remixSelector).toEqual({
      kind: 'trend_reference',
      sourceReferenceId: 'ref-1',
      trendId: 'twitter-1',
    });
  });

  it('has no remix selector when there is no durable source reference', () => {
    const result = toDeskItemFromTrend(
      makeTrendItem({ platform: 'instagram', sourceReferenceId: undefined }),
    );

    expect(result.remixSelector).toBeNull();
  });

  it('has no remix selector on a non-prefilled platform', () => {
    const result = toDeskItemFromTrend(
      makeTrendItem({ platform: 'twitter', sourceReferenceId: 'ref-2' }),
    );

    expect(result.remixSelector).toBeNull();
  });

  it('computes velocity as engagement per hour elapsed since publishedAt', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const result = toDeskItemFromTrend(
      makeTrendItem({ metrics: { likes: 200 }, publishedAt: twoHoursAgo }),
    );

    expect(result.velocity).toBeCloseTo(100, 0);
  });

  it('returns 0 velocity when publishedAt is missing', () => {
    const result = toDeskItemFromTrend(
      makeTrendItem({ metrics: { likes: 200 }, publishedAt: undefined }),
    );

    expect(result.velocity).toBe(0);
  });
});

describe('toDeskItemFromSourcePost', () => {
  it('maps a source post into a desk item sourced from "following"', () => {
    const result = toDeskItemFromSourcePost(makeSourcePost());

    expect(result.key).toBe('source_post:post-1');
    expect(result.kind).toBe('source_post');
    expect(result.source).toBe('following');
    expect(result.engagement).toBe(4 + 120 + 2 + 5000);
    expect(result.virality).toBe(0);
    expect(result.matchedTrends).toEqual([]);
  });

  it('opens the prefilled remix on a prefilled platform', () => {
    const result = toDeskItemFromSourcePost(
      makeSourcePost({
        id: 'post-2',
        platform: SocialSourcePlatform.INSTAGRAM,
      }),
    );

    expect(result.remixSelector).toEqual({
      kind: 'source_post',
      sourcePostId: 'post-2',
    });
  });

  it('has no remix selector on a non-prefilled platform', () => {
    const result = toDeskItemFromSourcePost(
      makeSourcePost({ platform: SocialSourcePlatform.TWITTER }),
    );

    expect(result.remixSelector).toBeNull();
  });

  it('normalizes an unrecognized content type to "post"', () => {
    const result = toDeskItemFromSourcePost(
      makeSourcePost({ contentType: 'carousel' }),
    );

    expect(result.contentType).toBe('post');
  });

  it('normalizes a reel content type to "video"', () => {
    const result = toDeskItemFromSourcePost(
      makeSourcePost({ contentType: 'reel' }),
    );

    expect(result.contentType).toBe('video');
  });
});

describe('toDeskItemFromViralVideo', () => {
  it('maps a viral video into a desk item with no remix selector', () => {
    const result = toDeskItemFromViralVideo(makeViralVideo());

    expect(result.key).toBe('viral_video:video-1');
    expect(result.kind).toBe('viral_video');
    expect(result.source).toBe('trends');
    expect(result.contentType).toBe('video');
    expect(result.remixSelector).toBeNull();
    expect(result.virality).toBe(87);
    expect(result.matchedTrends).toEqual(['#ShortFormAI']);
  });

  it('sums the available metrics into engagement', () => {
    const result = toDeskItemFromViralVideo(
      makeViralVideo({ likes: 800, shares: 40, viewCount: 12000 }),
    );

    expect(result.engagement).toBe(800 + 40 + 12000);
  });
});
