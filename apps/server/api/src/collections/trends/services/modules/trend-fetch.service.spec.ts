import { TrendFetchService } from '@api/collections/trends/services/modules/trend-fetch.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TrendFetchService', () => {
  let service: TrendFetchService;

  const mockPrisma = { trend: { create: vi.fn(), findMany: vi.fn() } };
  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const mockCacheService = {
    get: vi.fn(),
    set: vi.fn(),
  };
  const mockApifyService = {
    getInstagramTrends: vi.fn(),
    getPinterestTrends: vi.fn(),
    getRedditTrends: vi.fn(),
    getTikTokTrends: vi.fn(),
    getTwitterTrends: vi.fn(),
    getYouTubeTrends: vi.fn(),
  };
  const mockLinkedInService = {
    getTrends: vi.fn(),
  };
  const mockXaiService = {
    getTrends: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockResolvedValue(undefined);
    mockApifyService.getTwitterTrends.mockResolvedValue([]);
    mockLinkedInService.getTrends.mockResolvedValue([]);

    service = new TrendFetchService(
      mockPrisma as never,
      mockLoggerService as never,
      mockCacheService as never,
      mockApifyService as never,
      mockLinkedInService as never,
      mockXaiService as never,
    );
  });

  it('filters stale Grok topics with past-year tokens before returning Twitter trends', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));

    mockXaiService.getTrends.mockResolvedValue([
      {
        contentAngle: 'Cover the live reactions',
        context: 'Fans are discussing the opening ceremony from 2024',
        growthRate: 92,
        hashtags: ['#Olympics2024'],
        mentions: 75000,
        topic: '#Olympics2024',
      },
      {
        contentAngle: 'Break down the product launch',
        context: 'Creators are reacting to today’s AI release',
        growthRate: 84,
        hashtags: ['#AIAgents'],
        mentions: 54000,
        topic: '#AIAgents',
      },
    ]);

    const result = await service.fetchTwitterTrends();

    expect(result).toHaveLength(1);
    expect(result[0]?.topic).toBe('#AIAgents');
    expect(mockApifyService.getTwitterTrends).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('falls back to Apify when every Grok topic is rejected as stale', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));

    mockXaiService.getTrends.mockResolvedValue([
      {
        contentAngle: 'Talk about the old event',
        context: 'Highlights from the completed 2024 Olympics event',
        growthRate: 66,
        hashtags: ['#Olympics2024'],
        mentions: 42000,
        topic: '#Olympics2024',
      },
    ]);

    mockApifyService.getTwitterTrends.mockResolvedValue([
      {
        growthRate: 44,
        mentions: 12000,
        metadata: {},
        platform: 'twitter',
        topic: '#AIAgents',
      },
    ]);

    const result = await service.fetchTwitterTrends();

    expect(mockApifyService.getTwitterTrends).toHaveBeenCalledWith({
      limit: 20,
    });
    expect(result).toEqual([
      {
        growthRate: 44,
        mentions: 12000,
        metadata: {},
        platform: 'twitter',
        topic: '#AIAgents',
      },
    ]);

    vi.useRealTimers();
  });

  it('maps LinkedIn live trend topics into TrendData', async () => {
    mockLinkedInService.getTrends.mockResolvedValue([
      {
        growthRate: 72,
        mentions: 6,
        metadata: {
          sampleContent: 'Teams are investing heavily in #ai workflows.',
          source: 'public-scrape',
          trendType: 'hashtag',
          urls: ['https://www.linkedin.com/company/openai/'],
        },
        topic: '#ai',
      },
    ]);

    const result = await service.fetchLinkedInTrends('org-1', 'brand-1');

    expect(mockLinkedInService.getTrends).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
    );
    expect(result).toEqual([
      {
        growthRate: 72,
        mentions: 6,
        metadata: {
          sampleContent: 'Teams are investing heavily in #ai workflows.',
          source: 'public-scrape',
          trendType: 'hashtag',
          urls: ['https://www.linkedin.com/company/openai/'],
        },
        platform: 'linkedin',
        topic: '#ai',
      },
    ]);
  });
});
