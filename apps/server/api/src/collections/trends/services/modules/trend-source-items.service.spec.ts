import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import { TrendSourceItemsService } from '@api/collections/trends/services/modules/trend-source-items.service';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { Test, TestingModule } from '@nestjs/testing';

type ApifyMock = {
  searchInstagramByHashtag: ReturnType<typeof vi.fn>;
  searchRedditPosts: ReturnType<typeof vi.fn>;
  searchTikTokByHashtag: ReturnType<typeof vi.fn>;
  searchTwitterTweets: ReturnType<typeof vi.fn>;
  searchYouTubeVideos: ReturnType<typeof vi.fn>;
};

const makeTrend = (overrides: Record<string, unknown> = {}): TrendEntity =>
  ({
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    id: 'trend-1',
    mentions: 1000,
    metadata: { hashtags: ['#AI'] },
    platform: 'instagram',
    topic: 'AI trends',
    viralityScore: 80,
    ...overrides,
  }) as unknown as TrendEntity;

describe('TrendSourceItemsService', () => {
  let service: TrendSourceItemsService;
  let apify: ApifyMock;

  beforeEach(async () => {
    apify = {
      searchInstagramByHashtag: vi.fn().mockResolvedValue([]),
      searchRedditPosts: vi.fn().mockResolvedValue([]),
      searchTikTokByHashtag: vi.fn().mockResolvedValue([]),
      searchTwitterTweets: vi.fn().mockResolvedValue([]),
      searchYouTubeVideos: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendSourceItemsService,
        { provide: ApifyService, useValue: apify },
      ],
    }).compile();

    service = module.get(TrendSourceItemsService);
  });

  describe('fetchTrendSourceItems', () => {
    it('returns [] without calling Apify when no search term is resolvable', async () => {
      const trend = makeTrend({ metadata: { hashtags: [] }, topic: '' });

      const result = await service.fetchTrendSourceItems(trend, 5);

      expect(result).toEqual([]);
      expect(apify.searchInstagramByHashtag).not.toHaveBeenCalled();
    });

    it('returns [] for an unsupported platform', async () => {
      const trend = makeTrend({ platform: 'pinterest' });

      const result = await service.fetchTrendSourceItems(trend, 5);

      expect(result).toEqual([]);
      expect(apify.searchInstagramByHashtag).not.toHaveBeenCalled();
    });

    it('dispatches Instagram to the hashtag search and maps + filters null posts', async () => {
      apify.searchInstagramByHashtag.mockResolvedValue([
        {
          caption: 'first',
          id: 'ig-1',
          imageUrl: 'https://img/1.jpg',
          likesCount: 10,
          ownerUsername: 'creator',
          shortCode: 'abc',
        },
        // no shortCode / videoUrl / imageUrl -> mapper returns null -> filtered
        { caption: 'second', id: 'ig-2' },
      ]);

      const result = await service.fetchTrendSourceItems(makeTrend(), 5);

      expect(apify.searchInstagramByHashtag).toHaveBeenCalledWith('AI', {
        limit: 5,
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        contentType: 'image',
        id: 'ig-1',
        platform: 'instagram',
        sourceClassification: expect.objectContaining({
          intendedUse: 'organic_trend_discovery',
          platform: 'instagram',
          sourceAuthor: 'creator',
          sourceKind: 'public_platform_reference',
          sourceLabel: 'Instagram',
          sourceTopic: 'AI trends',
        }),
        sourceUrl: 'https://www.instagram.com/p/abc/',
      });
    });

    it('strips a leading # from the hashtag before searching', async () => {
      await service.fetchTrendSourceItems(
        makeTrend({ metadata: { hashtags: ['#ShortForm'] } }),
        3,
      );

      expect(apify.searchInstagramByHashtag).toHaveBeenCalledWith('ShortForm', {
        limit: 3,
      });
    });

    it('dispatches Twitter and maps tweets (never null)', async () => {
      apify.searchTwitterTweets.mockResolvedValue([
        { authorUsername: 'jack', id: 'tw-1', text: 'hello' },
      ]);

      const result = await service.fetchTrendSourceItems(
        makeTrend({ platform: 'twitter' }),
        5,
      );

      expect(apify.searchTwitterTweets).toHaveBeenCalledWith('AI', {
        limit: 5,
      });
      expect(result[0]).toMatchObject({
        contentType: 'tweet',
        platform: 'twitter',
        sourceUrl: 'https://x.com/jack/status/tw-1',
      });
    });

    it('falls back to the topic when no hashtag is present', async () => {
      await service.fetchTrendSourceItems(
        makeTrend({
          metadata: {},
          platform: 'reddit',
          topic: 'creator stacks',
        }),
        5,
      );

      expect(apify.searchRedditPosts).toHaveBeenCalledWith('creator stacks', {
        limit: 5,
      });
    });

    it('dispatches TikTok and drops videos without a web url', async () => {
      apify.searchTikTokByHashtag.mockResolvedValue([
        {
          authorMeta: { name: 'tk' },
          desc: 'clip',
          diggCount: 5,
          id: 'tk-1',
          webVideoUrl: 'https://tiktok.com/v/1',
        },
        { desc: 'no url', id: 'tk-2' }, // no webVideoUrl -> null -> filtered
      ]);

      const result = await service.fetchTrendSourceItems(
        makeTrend({ platform: 'tiktok' }),
        5,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        contentType: 'video',
        platform: 'tiktok',
        sourceUrl: 'https://tiktok.com/v/1',
      });
    });

    it('dispatches YouTube and drops videos without a url', async () => {
      apify.searchYouTubeVideos.mockResolvedValue([
        {
          channelName: 'chan',
          id: 'yt-1',
          title: 'A video',
          url: 'https://youtu.be/1',
        },
        { id: 'yt-2', title: 'missing url' }, // no url -> null -> filtered
      ]);

      const result = await service.fetchTrendSourceItems(
        makeTrend({ platform: 'youtube' }),
        5,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        authorHandle: 'chan',
        platform: 'youtube',
        sourceUrl: 'https://youtu.be/1',
        title: 'A video',
      });
    });

    it('maps Reddit posts via permalink and drops urless posts', async () => {
      apify.searchRedditPosts.mockResolvedValue([
        {
          author: 'redditor',
          id: 'rd-1',
          isVideo: false,
          numComments: 3,
          permalink: '/r/x/abc',
          score: 12,
          title: 'A thread',
        },
        { id: 'rd-2', title: 'no url' }, // no permalink/url -> null -> filtered
      ]);

      const result = await service.fetchTrendSourceItems(
        makeTrend({ platform: 'reddit' }),
        5,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        contentType: 'post',
        platform: 'reddit',
        sourceUrl: 'https://reddit.com/r/x/abc',
      });
    });
  });

  describe('buildFallbackTrendSourceItems', () => {
    it('synthesizes one item per metadata url', () => {
      const trend = makeTrend({
        metadata: {
          sampleContent: 'sample',
          sourceClassification: {
            capturedAt: '2026-06-09T00:00:00.000Z',
            confidence: 'low',
            freshnessWindowDays: 7,
            intendedUse: 'organic_trend_discovery',
            sourceKind: 'public_platform_reference',
            sourceLabel: 'YouTube',
            sourceTopic: '#ai',
          },
          urls: ['https://a.com', 'https://b.com'],
        },
        platform: 'youtube',
      });

      const items = service.buildFallbackTrendSourceItems(trend);

      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        contentType: 'post',
        id: 'trend-1-fallback-1',
        sourceClassification: expect.objectContaining({
          platform: 'youtube',
          sourceKind: 'public_platform_reference',
          sourceTimestamp: '2026-01-01T00:00:00.000Z',
        }),
        sourceUrl: 'https://a.com',
        text: 'sample',
      });
    });

    it('returns [] when there are no urls or media', () => {
      expect(
        service.buildFallbackTrendSourceItems(makeTrend({ metadata: {} })),
      ).toEqual([]);
    });
  });

  describe('stored-preview accessors', () => {
    it('reads, validates, and limits the cached preview', () => {
      const trend = makeTrend({
        metadata: {
          sourcePreviewCache: [
            {
              contentType: 'post',
              id: 'a',
              platform: 'instagram',
              sourceUrl: 'https://a',
            },
            { id: 'invalid' }, // fails the type guard -> filtered
          ],
        },
      });

      expect(service.getStoredTrendSourcePreview(trend, 5)).toHaveLength(1);
    });

    it('infers fallback vs live preview state from the first item id', () => {
      expect(
        service.getSourcePreviewState([{ id: 'x-fallback-1' } as never]),
      ).toBe('fallback');
      expect(service.getSourcePreviewState([{ id: 'x-1' } as never])).toBe(
        'live',
      );
      expect(service.getSourcePreviewState([])).toBe('empty');
    });

    it('prefers the persisted state flag over inference', () => {
      const trend = makeTrend({
        metadata: { sourcePreviewState: 'live' },
      });

      expect(service.getStoredTrendSourcePreviewState(trend, [])).toBe('live');
    });
  });

  describe('toSyncTrendInput', () => {
    it('projects the trend with its stored preview and state', () => {
      const trend = makeTrend({
        metadata: {
          sourcePreviewCache: [
            {
              contentType: 'post',
              id: 'a',
              platform: 'instagram',
              sourceUrl: 'https://a',
            },
          ],
          sourcePreviewState: 'fallback',
        },
      });

      expect(service.toSyncTrendInput(trend)).toMatchObject({
        id: 'trend-1',
        mentions: 1000,
        platform: 'instagram',
        sourcePreviewState: 'fallback',
        topic: 'AI trends',
        viralityScore: 80,
      });
    });
  });
});
