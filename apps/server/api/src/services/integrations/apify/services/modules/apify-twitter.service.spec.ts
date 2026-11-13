import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyTwitterService } from '@api/services/integrations/apify/services/modules/apify-twitter.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ApifyTwitterService', () => {
  let service: ApifyTwitterService;
  let baseService: {
    ACTORS: Record<string, string>;
    calculateGrowthRate: ReturnType<typeof vi.fn>;
    getApiToken: ReturnType<typeof vi.fn>;
    logFailure: ReturnType<typeof vi.fn>;
    loggerService: {
      error: ReturnType<typeof vi.fn>;
      log: ReturnType<typeof vi.fn>;
    };
    runActor: ReturnType<typeof vi.fn>;
  };

  const mockTrend = {
    countryCode: 'US',
    isHashtag: true,
    isPromoted: false,
    name: '#AItrending',
    rank: 1,
    tweetVolume: 150000,
    twitterSearchUrl: 'http://twitter.com/search?q=%23AItrending',
  };

  beforeEach(async () => {
    baseService = {
      ACTORS: {
        TWITTER_TRENDS: 'automation-lab/twitter-trends-scraper',
      },
      calculateGrowthRate: vi.fn().mockReturnValue(65),
      getApiToken: vi.fn().mockReturnValue('test-token'),
      logFailure: vi.fn(),
      loggerService: { error: vi.fn(), log: vi.fn() },
      runActor: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApifyTwitterService,
        { provide: ApifyBaseService, useValue: baseService },
      ],
    }).compile();

    service = module.get<ApifyTwitterService>(ApifyTwitterService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getTwitterTrends normalizes trends', async () => {
    baseService.runActor.mockResolvedValue([mockTrend]);
    const result = await service.getTwitterTrends({ limit: 10, region: 'US' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      mentions: 150000,
      platform: 'twitter',
      topic: '#AItrending',
    });
    expect(result[0].metadata).toMatchObject({
      hashtags: ['AItrending'],
      trendType: 'hashtag',
      urls: ['http://twitter.com/search?q=%23AItrending'],
    });
    expect(baseService.runActor).toHaveBeenCalledWith(
      'automation-lab/twitter-trends-scraper',
      { locations: ['US'], maxTrendsPerLocation: 10 },
    );
  });

  it('getTwitterTrends drops promoted and nameless rows and tolerates a null volume', async () => {
    baseService.runActor.mockResolvedValue([
      { ...mockTrend, isPromoted: true, name: '#Sponsored' },
      { ...mockTrend, name: undefined },
      { ...mockTrend, isHashtag: false, name: 'Election', tweetVolume: null },
    ]);
    const result = await service.getTwitterTrends();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ mentions: 0, topic: 'Election' });
    expect(result[0].metadata.trendType).toBe('topic');
  });

  it('getTwitterTrends rethrows provider failures', async () => {
    baseService.runActor.mockRejectedValue(new Error('API error'));
    await expect(service.getTwitterTrends()).rejects.toThrow('API error');
  });

  it('normalizes trend without hashtag prefix as topic type', async () => {
    baseService.runActor.mockResolvedValue([
      { ...mockTrend, isHashtag: undefined, name: 'Breaking News' },
    ]);
    const result = await service.getTwitterTrends();
    expect(result[0].metadata.trendType).toBe('topic');
  });
});
