import { CredentialPlatform } from '@genfeedai/enums';
import { TwitterResponseMapper } from './twitter-response.mapper';

describe('TwitterResponseMapper', () => {
  const mapper = new TwitterResponseMapper();

  describe('mapSearchResults', () => {
    it('projects authors and sorts tweets by engagement', () => {
      const result = mapper.mapSearchResults({
        data: {
          data: [
            {
              author_id: 'author-low',
              created_at: '2026-01-01T00:00:00.000Z',
              id: 'tweet-low',
              public_metrics: { like_count: 1 },
              text: 'Low engagement',
            },
            {
              author_id: 'author-high',
              created_at: '2026-01-02T00:00:00.000Z',
              id: 'tweet-high',
              public_metrics: { like_count: 5, retweet_count: 3 },
              text: 'High engagement',
            },
          ],
        },
        includes: {
          users: [
            { id: 'author-low', name: 'Low', username: 'low' },
            { id: 'author-high', name: 'High', username: 'high' },
          ],
        },
      });

      expect(result).toEqual([
        expect.objectContaining({
          authorName: 'High',
          authorUsername: 'high',
          engagement: 8,
          id: 'tweet-high',
        }),
        expect.objectContaining({
          authorName: 'Low',
          authorUsername: 'low',
          engagement: 1,
          id: 'tweet-low',
        }),
      ]);
    });

    it('returns an empty projection for a partial response', () => {
      expect(mapper.mapSearchResults({})).toEqual([]);
    });
  });

  describe('user projections', () => {
    it('maps a user and follower count', () => {
      expect(
        mapper.mapUser({
          data: {
            id: 'user-1',
            name: 'User One',
            public_metrics: { followers_count: 42 },
            username: 'userone',
          },
        }),
      ).toEqual({
        followersCount: 42,
        id: 'user-1',
        name: 'User One',
        username: 'userone',
      });
    });

    it('returns null or an empty list when provider data is absent', () => {
      expect(mapper.mapUser({})).toBeNull();
      expect(mapper.mapUsers({})).toEqual([]);
    });
  });

  describe('mapTrends', () => {
    it('projects scope and normalized growth', () => {
      expect(
        mapper.mapTrends(
          [
            {
              trends: [
                {
                  name: '#launch',
                  tweet_volume: 250_000,
                  url: 'https://x.com/search?q=%23launch',
                },
              ],
            },
          ],
          'organization-1',
          'brand-1',
        ),
      ).toEqual([
        {
          brandId: 'brand-1',
          growthRate: 25,
          mentions: 250_000,
          organizationId: 'organization-1',
          platform: CredentialPlatform.TWITTER,
          topic: '#launch',
          url: 'https://x.com/search?q=%23launch',
        },
      ]);
    });
  });

  describe('analytics projections', () => {
    it('projects video views, impressions, and engagement rate', () => {
      const result = mapper.mapAnalytics({
        data: [
          {
            organic_metrics: { impression_count: 1_000 },
            public_metrics: {
              like_count: 50,
              quote_count: 5,
              reply_count: 10,
              retweet_count: 10,
            },
          },
        ],
        includes: {
          media: [
            {
              public_metrics: { view_count: 5_000 },
              type: 'video',
            },
          ],
        },
      });

      expect(result).toEqual({
        bookmarks: 0,
        comments: 10,
        engagementRate: 7.5,
        impressions: 1_000,
        likes: 50,
        mediaType: 'video',
        quotes: 5,
        retweets: 10,
        views: 5_000,
      });
    });

    it('returns the existing zero-value contract for a partial response', () => {
      expect(mapper.mapAnalytics({})).toEqual({
        bookmarks: 0,
        comments: 0,
        engagementRate: undefined,
        impressions: undefined,
        likes: 0,
        mediaType: 'text',
        quotes: 0,
        retweets: 0,
        views: 0,
      });
    });

    it('correlates batch media by key and ignores malformed rows without IDs', () => {
      const result = mapper.mapAnalyticsBatch({
        data: [
          {
            attachments: { media_keys: ['media-1'] },
            id: 'tweet-1',
            public_metrics: { like_count: 2 },
          },
          {
            public_metrics: { like_count: 99 },
          },
        ],
        includes: {
          media: [
            {
              media_key: 'media-1',
              public_metrics: { view_count: 900 },
              type: 'video',
            },
          ],
        },
      });

      expect(result.size).toBe(1);
      expect(result.get('tweet-1')).toEqual(
        expect.objectContaining({
          likes: 2,
          mediaType: 'video',
          views: 900,
        }),
      );
    });
  });
});
