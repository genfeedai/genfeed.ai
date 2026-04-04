import { YoutubeAnalyticsService } from '@api/services/integrations/youtube/services/modules/youtube-analytics.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import type { IYouTubeVideoStats } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock googleapis at module level
const mockChannelsList = vi.fn();
const mockVideosList = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    youtube: () => ({
      channels: { list: mockChannelsList },
      videos: { list: mockVideosList },
    }),
  },
}));

describe('YoutubeAnalyticsService', () => {
  let service: YoutubeAnalyticsService;
  let authService: { refreshToken: ReturnType<typeof vi.fn> };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const mockAuth = { credentials: { access_token: 'test-token' } };

  beforeEach(async () => {
    authService = {
      refreshToken: vi.fn().mockResolvedValue(mockAuth),
    };

    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeAnalyticsService,
        { provide: YoutubeAuthService, useValue: authService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<YoutubeAnalyticsService>(YoutubeAnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // --- getTrends ---

  it('should return hardcoded trends with default region US', () => {
    const trends = service.getTrends('org-1', 'brand-1');
    expect(trends).toHaveLength(5);
    expect(trends[0]).toEqual(
      expect.objectContaining({ regionCode: 'US', topic: 'AI Technology' }),
    );
  });

  it('should return trends with custom region code', () => {
    const trends = service.getTrends('org-1', 'brand-1', 'DE');
    expect(trends[0]).toEqual(expect.objectContaining({ regionCode: 'DE' }));
  });

  // --- getChannelDetails ---

  it('should return channel details on success', async () => {
    mockChannelsList.mockResolvedValueOnce({
      data: {
        items: [
          {
            brandingSettings: {
              channel: { keywords: 'test' },
              image: { bannerExternalUrl: 'https://example.com/banner.jpg' },
            },
            id: 'UCtest123',
            snippet: {
              country: 'US',
              customUrl: '@testchannel',
              defaultLanguage: 'en',
              description: 'A test channel',
              publishedAt: '2020-01-01T00:00:00Z',
              thumbnails: { default: { url: 'https://example.com/thumb.jpg' } },
              title: 'Test Channel',
            },
            statistics: {
              hiddenSubscriberCount: false,
              subscriberCount: '500',
              videoCount: '50',
              viewCount: '1000',
            },
          },
        ],
      },
    });

    const details = await service.getChannelDetails('org-1', 'brand-1');

    expect(details).toEqual(
      expect.objectContaining({
        description: 'A test channel',
        id: 'UCtest123',
        statistics: expect.objectContaining({
          subscriberCount: 500,
          videoCount: 50,
          viewCount: 1000,
        }),
        title: 'Test Channel',
      }),
    );
    expect(authService.refreshToken).toHaveBeenCalledWith('org-1', 'brand-1');
  });

  it('should throw when no channel items returned', async () => {
    mockChannelsList.mockResolvedValueOnce({ data: { items: [] } });

    await expect(service.getChannelDetails('org-1', 'brand-1')).rejects.toThrow(
      'No channel found for the authenticated user',
    );
  });

  it('should throw when snippet/statistics/branding is missing', async () => {
    mockChannelsList.mockResolvedValueOnce({
      data: {
        items: [
          {
            brandingSettings: null,
            id: 'UCtest',
            snippet: null,
            statistics: null,
          },
        ],
      },
    });

    await expect(service.getChannelDetails('org-1', 'brand-1')).rejects.toThrow(
      'Failed to get channel details',
    );
  });

  it('should use pre-supplied auth when passed as third argument (non-boolean)', async () => {
    const customAuth = { credentials: { access_token: 'custom-token' } };
    mockChannelsList.mockResolvedValueOnce({
      data: {
        items: [
          {
            brandingSettings: { channel: {}, image: {} },
            id: 'UC-custom',
            snippet: { description: '', thumbnails: {}, title: 'Custom' },
            statistics: {
              subscriberCount: '0',
              videoCount: '0',
              viewCount: '0',
            },
          },
        ],
      },
    });

    await service.getChannelDetails('org-1', 'brand-1', customAuth);

    // Should NOT call refreshToken when auth is provided directly
    expect(authService.refreshToken).not.toHaveBeenCalled();
    expect(mockChannelsList).toHaveBeenCalledWith(
      expect.objectContaining({ auth: customAuth }),
    );
  });

  it('should call refreshToken when boolean passed as third argument', async () => {
    mockChannelsList.mockResolvedValueOnce({
      data: {
        items: [
          {
            brandingSettings: { channel: {}, image: {} },
            id: 'UC-bool',
            snippet: { description: '', thumbnails: {}, title: 'Bool' },
            statistics: {
              subscriberCount: '0',
              videoCount: '0',
              viewCount: '0',
            },
          },
        ],
      },
    });

    await service.getChannelDetails('org-1', 'brand-1', true);

    expect(authService.refreshToken).toHaveBeenCalledWith('org-1', 'brand-1');
  });

  // --- getMediaAnalytics ---

  it('should return stats for a single video', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            contentDetails: { duration: 'PT5M30S' },
            id: 'vid-1',
            snippet: {},
            statistics: {
              commentCount: '10',
              favoriteCount: '5',
              likeCount: '50',
              viewCount: '1000',
            },
          },
        ],
      },
    });

    const result = await service.getMediaAnalytics('org-1', 'brand-1', 'vid-1');

    expect(result).toEqual(
      expect.objectContaining({
        comments: 10,
        duration: 330,
        likes: 50,
        mediaType: 'video',
        views: 1000,
      }),
    );
  });

  it('should throw when video stats not found for single video call', async () => {
    mockVideosList.mockResolvedValueOnce({ data: { items: [] } });

    await expect(
      service.getMediaAnalytics('org-1', 'brand-1', 'vid-missing'),
    ).rejects.toThrow('Statistics not found');
  });

  // --- getMediaAnalyticsBatch ---

  it('should return empty map for empty videoIds array', async () => {
    const result = await service.getMediaAnalyticsBatch('org-1', 'brand-1', []);
    expect(result.size).toBe(0);
  });

  it('should throw when more than 50 video IDs are provided', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `vid-${i}`);
    await expect(
      service.getMediaAnalyticsBatch('org-1', 'brand-1', ids),
    ).rejects.toThrow('YouTube API supports maximum 50 video IDs per request');
  });

  it('should classify videos <= 60s as "short"', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            contentDetails: { duration: 'PT45S' },
            id: 'short-vid',
            snippet: {},
            statistics: {
              commentCount: '3',
              favoriteCount: '0',
              likeCount: '20',
              viewCount: '500',
            },
          },
        ],
      },
    });

    const result = await service.getMediaAnalyticsBatch('org-1', 'brand-1', [
      'short-vid',
    ]);
    const stats = result.get('short-vid') as IYouTubeVideoStats;
    expect(stats.mediaType).toBe('short');
    expect(stats.duration).toBe(45);
  });

  it('should classify videos > 60s as "video"', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            contentDetails: { duration: 'PT2H15M10S' },
            id: 'long-vid',
            snippet: {},
            statistics: {
              commentCount: '30',
              favoriteCount: '0',
              likeCount: '100',
              viewCount: '2000',
            },
          },
        ],
      },
    });

    const result = await service.getMediaAnalyticsBatch('org-1', 'brand-1', [
      'long-vid',
    ]);
    const stats = result.get('long-vid') as IYouTubeVideoStats;
    expect(stats.mediaType).toBe('video');
    expect(stats.duration).toBe(2 * 3600 + 15 * 60 + 10);
  });

  it('should calculate engagement rate correctly', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            contentDetails: { duration: 'PT3M' },
            id: 'eng-vid',
            snippet: {},
            statistics: {
              commentCount: '30',
              favoriteCount: '20',
              likeCount: '50',
              viewCount: '1000',
            },
          },
        ],
      },
    });

    const result = await service.getMediaAnalyticsBatch('org-1', 'brand-1', [
      'eng-vid',
    ]);
    const stats = result.get('eng-vid') as IYouTubeVideoStats;
    // engagement = (50 + 30 + 20) / 1000 * 100 = 10.00
    expect(stats.engagementRate).toBe(10);
  });

  it('should skip items without id or statistics', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            contentDetails: {},
            id: null,
            snippet: {},
            statistics: { viewCount: '100' },
          },
          {
            contentDetails: { duration: 'PT2M' },
            id: 'valid',
            snippet: {},
            statistics: {
              commentCount: '5',
              favoriteCount: '0',
              likeCount: '10',
              viewCount: '200',
            },
          },
        ],
      },
    });

    const result = await service.getMediaAnalyticsBatch('org-1', 'brand-1', [
      'valid',
    ]);
    expect(result.size).toBe(1);
    expect(result.has('valid')).toBe(true);
  });

  it('should rethrow API errors from getMediaAnalyticsBatch', async () => {
    mockVideosList.mockRejectedValueOnce(new Error('API rate limit'));

    await expect(
      service.getMediaAnalyticsBatch('org-1', 'brand-1', ['vid-1']),
    ).rejects.toThrow('API rate limit');
    expect(loggerService.error).toHaveBeenCalled();
  });
});
