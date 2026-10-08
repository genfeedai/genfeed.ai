import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import {
  classifyTimelineError,
  SocialTimelineProviderService,
  timelineCapability,
} from '@api/services/social-timeline/social-timeline-provider.service';
import type { ConfigService } from '@libs/config/config.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  homeTimeline: vi.fn(),
  tweet: vi.fn(),
  like: vi.fn(),
  retweet: vi.fn(),
  subscriptions: { list: vi.fn() },
  channels: { list: vi.fn() },
  playlistItems: { list: vi.fn() },
  videos: { rate: vi.fn() },
  commentThreads: { insert: vi.fn() },
}));
vi.mock('twitter-api-v2', () => ({
  TwitterApi: class {
    v2 = mocks;
  },
}));
vi.mock('googleapis', () => ({ google: { youtube: () => mocks } }));
vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => value },
}));

describe('native following adapters', () => {
  const scope = { organizationId: 'org', brandId: 'brand', userId: 'user' };
  const credentials = { resolveBrandAccount: vi.fn(), patch: vi.fn() };
  const youtubeAuth = { refreshToken: vi.fn() };
  const service = new SocialTimelineProviderService(
    credentials as unknown as CredentialsService,
    youtubeAuth as unknown as YoutubeAuthService,
    {} as ConfigService,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    credentials.resolveBrandAccount.mockResolvedValue({
      accessToken: 'test-token',
    });
    mocks.me.mockResolvedValue({ data: { id: 'own-user' } });
  });

  it('calls homeTimeline, excludes the connected account’s own uploads and preserves playable media and author identity', async () => {
    mocks.homeTimeline.mockResolvedValue({
      data: {
        data: [
          { id: 'own', author_id: 'own-user', text: 'Own post' },
          {
            id: 'followed',
            author_id: 'creator',
            text: 'Creator post',
            attachments: { media_keys: ['media'] },
            public_metrics: { like_count: 12 },
            entities: { hashtags: [{ tag: 'example' }] },
          },
        ],
        includes: {
          users: [{ id: 'creator', username: 'creator', name: 'Creator' }],
          media: [
            {
              media_key: 'media',
              type: 'video',
              preview_image_url: 'https://example.com/poster.jpg',
              variants: [
                {
                  content_type: 'video/mp4',
                  url: 'https://example.com/video.mp4',
                  bit_rate: 123,
                },
              ],
            },
          ],
        },
      },
    });
    const result = await service.collect(scope, 'credential', 'twitter');
    expect(mocks.homeTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        max_results: 100,
        expansions: ['author_id', 'attachments.media_keys'],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      externalId: 'followed',
      platform: 'twitter',
      contentType: 'video',
      authorHandle: 'creator',
      mediaUrls: ['https://example.com/video.mp4'],
      hashtags: ['example'],
      metrics: { likes: 12 },
    });
    expect(credentials.resolveBrandAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org',
        brandId: 'brand',
        credentialId: 'credential',
        platform: 'twitter',
      }),
    );
  });

  it('uses distinct native endpoints for replies and quotes', async () => {
    mocks.tweet.mockResolvedValue({ data: { id: 'new-post' } });
    await service.execute(scope, 'credential', 'twitter', {
      action: 'reply',
      externalId: 'post',
      text: 'Reply',
    });
    await service.execute(scope, 'credential', 'twitter', {
      action: 'quote',
      externalId: 'post',
      text: 'Quote',
    });
    expect(mocks.tweet).toHaveBeenNthCalledWith(1, {
      text: 'Reply',
      reply: { in_reply_to_tweet_id: 'post' },
    });
    expect(mocks.tweet).toHaveBeenNthCalledWith(2, {
      text: 'Quote',
      quote_tweet_id: 'post',
    });
  });

  it('reads the selected account’s subscriptions and their uploads, rather than its own upload history', async () => {
    youtubeAuth.refreshToken.mockResolvedValue({});
    mocks.subscriptions.list.mockResolvedValue({
      data: {
        items: [{ snippet: { resourceId: { channelId: 'followed-channel' } } }],
      },
    });
    mocks.channels.list.mockResolvedValue({
      data: {
        items: [
          {
            contentDetails: {
              relatedPlaylists: { uploads: 'followed-uploads' },
            },
          },
        ],
      },
    });
    mocks.playlistItems.list.mockResolvedValue({
      data: {
        items: [
          {
            contentDetails: {
              videoId: 'video-a',
              videoPublishedAt: '2026-10-08T10:00:00Z',
            },
            snippet: {
              title: 'Actual upload',
              videoOwnerChannelId: 'followed-channel',
              videoOwnerChannelTitle: 'Creator',
              thumbnails: { high: { url: 'https://example.com/poster.jpg' } },
            },
          },
        ],
      },
    });
    const posts = await service.collect(scope, 'selected-youtube', 'youtube');
    expect(youtubeAuth.refreshToken).toHaveBeenCalledWith(
      'org',
      'brand',
      'selected-youtube',
    );
    expect(mocks.subscriptions.list).toHaveBeenCalledWith(
      expect.objectContaining({ mine: true }),
    );
    expect(mocks.channels.list).toHaveBeenCalledWith(
      expect.objectContaining({ id: ['followed-channel'] }),
    );
    expect(posts).toEqual([
      expect.objectContaining({
        externalId: 'video-a',
        authorId: 'followed-channel',
        sourceUrl: 'https://www.youtube.com/watch?v=video-a',
        publishedAt: '2026-10-08T10:00:00Z',
      }),
    ]);
  });

  it('publishes YouTube likes and comments through their distinct endpoints', async () => {
    youtubeAuth.refreshToken.mockResolvedValue({});
    mocks.commentThreads.insert.mockResolvedValue({
      data: { id: 'comment-a' },
    });
    await service.execute(scope, 'yt', 'youtube', {
      action: 'like',
      externalId: 'video-a',
    });
    expect(mocks.videos.rate).toHaveBeenCalledWith({
      id: 'video-a',
      rating: 'like',
    });
    expect(
      await service.execute(scope, 'yt', 'youtube', {
        action: 'comment',
        externalId: 'video-a',
        text: 'Actual comment',
      }),
    ).toBe('comment-a');
    expect(mocks.commentThreads.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: {
          snippet: {
            videoId: 'video-a',
            topLevelComment: { snippet: { textOriginal: 'Actual comment' } },
          },
        },
      }),
    );
  });

  it('gates actions using known granted permissions', () => {
    expect(
      timelineCapability('twitter', ['tweet.read', 'tweet.write']).actions,
    ).toEqual(['reply', 'repost', 'quote']);
    expect(timelineCapability('twitter', ['tweet.read']).actions).toEqual([]);
    expect(
      timelineCapability('youtube', [
        'https://www.googleapis.com/auth/youtube.readonly',
      ]).actions,
    ).toEqual([]);
  });

  it.each([
    [401, 'reconnect'],
    [402, 'budget_blocked'],
    [403, 'access_required'],
    [429, 'rate_limited'],
    [503, 'failed'],
  ])(
    'classifies HTTP %i without leaking provider response bodies',
    (status, expected) => {
      expect(
        classifyTimelineError({
          response: { status, data: { access_token: 'must-not-leak' } },
        }),
      ).toMatchObject({ status: expected });
      expect(
        JSON.stringify(classifyTimelineError({ response: { status } })),
      ).not.toContain('must-not-leak');
    },
  );

  it('does not promise home feeds where ordinary connections do not provide them', () => {
    expect(timelineCapability('tiktok')).toMatchObject({
      kind: 'unsupported',
      actions: [],
    });
    expect(timelineCapability('instagram')).toMatchObject({
      kind: 'unsupported',
      actions: [],
    });
    expect(timelineCapability('youtube')).toMatchObject({
      kind: 'subscriptions',
      actions: ['like', 'comment'],
    });
  });
});
