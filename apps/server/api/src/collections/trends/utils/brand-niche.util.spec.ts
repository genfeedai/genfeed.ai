import type { TrendingVideoDocument } from '@api/collections/trends/schemas/trending-video.schema';
import {
  buildBrandNicheQueries,
  countNicheTermMatches,
  isWithinTimeframe,
  matchedNicheTerms,
  rankBrandVideos,
} from '@api/collections/trends/utils/brand-niche.util';
import { Timeframe } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('brand niche util', () => {
  describe('buildBrandNicheQueries', () => {
    it('prefers explicit keywords, hashtags and categories, deduped and capped', () => {
      expect(
        buildBrandNicheQueries({
          categories: ['Marketing'],
          description: 'ignored when niche terms exist',
          hashtags: ['#AI Influencers', '#ugc'],
          keywords: ['ai influencers', 'virtual models'],
        }),
      ).toEqual(['ai influencers', 'virtual models', 'ugc']);
    });

    it('falls back to the leading description words', () => {
      expect(
        buildBrandNicheQueries({
          description: 'The open source AI studio for content creation teams',
        }),
      ).toEqual(['open source ai studio']);
    });

    it('returns nothing without any signal', () => {
      expect(buildBrandNicheQueries({ description: '  ' })).toEqual([]);
    });
  });

  describe('matchedNicheTerms', () => {
    it('names the niche terms a caption mentions and skips the rest', () => {
      expect(
        matchedNicheTerms(
          { hashtags: ['#UGC'], title: 'AI video ads beat studio shoots' },
          ['ai video', 'ugc', 'skincare'],
        ),
      ).toEqual(['ai video', 'ugc']);
    });
  });

  describe('countNicheTermMatches', () => {
    it('matches captions and run-together hashtags', () => {
      expect(
        countNicheTermMatches(
          { hashtags: ['aiinfluencers'], title: 'my new look' },
          ['ai influencers'],
        ),
      ).toBe(1);
      expect(
        countNicheTermMatches({ title: 'Exposing AI influencers' }, [
          'ai influencers',
          'ugc',
        ]),
      ).toBe(1);
    });

    it('does not match "ai" inside another word', () => {
      expect(
        countNicheTermMatches({ title: 'a quick maintain tip' }, ['ai']),
      ).toBe(0);
    });
  });

  describe('rankBrandVideos', () => {
    it('orders by relevance, then engagement, then views', () => {
      const videos: TrendingVideoDocument[] = [
        { externalId: 'search-hit-low', nicheQuery: 'q', viralScore: 1 },
        {
          externalId: 'caption-match',
          nicheQuery: 'q',
          title: 'ai influencers',
          viralScore: 10,
        },
        {
          externalId: 'caption-match-popular',
          nicheQuery: 'q',
          title: 'ai influencers',
          viralScore: 80,
        },
        { externalId: 'search-hit-high', nicheQuery: 'q', viralScore: 50 },
      ];

      expect(
        rankBrandVideos(videos, ['ai influencers']).map((v) => v.externalId),
      ).toEqual([
        'caption-match-popular',
        'caption-match',
        'search-hit-high',
        'search-hit-low',
      ]);
    });
  });

  describe('isWithinTimeframe', () => {
    const now = Date.parse('2026-10-21T00:00:00Z');

    it('keeps everything without a timeframe', () => {
      expect(isWithinTimeframe({}, undefined, now)).toBe(true);
    });

    it('drops videos older than the window or without a publish date', () => {
      const recent = { publishedAt: '2026-10-20T12:00:00Z' };
      const old = { publishedAt: '2026-10-01T00:00:00Z' };
      expect(isWithinTimeframe(recent, Timeframe.H24, now)).toBe(true);
      expect(isWithinTimeframe(old, Timeframe.D7, now)).toBe(false);
      expect(isWithinTimeframe({}, Timeframe.D7, now)).toBe(false);
    });
  });
});
