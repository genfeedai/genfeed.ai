import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyTwitterService } from '@api/services/integrations/apify/services/modules/apify-twitter.service';
import { ResearchCollectionRunner } from '@api/services/research-access/research-collection-runner.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ApifyTwitterService', () => {
  const researchRunner = { run: vi.fn() };
  let service: ApifyTwitterService;
  let baseService: {
    ACTORS: Record<string, string>;
    calculateGrowthRate: ReturnType<typeof vi.fn>;
    getApiToken: ReturnType<typeof vi.fn>;
    loggerService: {
      error: ReturnType<typeof vi.fn>;
      log: ReturnType<typeof vi.fn>;
    };
    runActor: ReturnType<typeof vi.fn>;
  };

  const mockTweet = {
    conversation_id_str: 'conv-1',
    created_at: '2024-01-15T10:00:00Z',
    entities: { hashtags: [{ text: 'ai' }] },
    favorite_count: 100,
    full_text: 'Hello world #ai',
    id: '123456',
    in_reply_to_status_id_str: null,
    in_reply_to_user_id_str: null,
    is_quote_status: false,
    quote_count: 5,
    reply_count: 10,
    retweet_count: 50,
    retweeted_status: null,
    text: 'Hello world #ai',
    user: {
      followers_count: 5000,
      id_str: 'user-1',
      name: 'Test User',
      profile_image_url_https: 'https://pbs.twimg.com/avatar.jpg',
      screen_name: 'testuser',
    },
  };

  const mockTrend = {
    category: 'Technology',
    name: '#AItrending',
    rank: 1,
    tweetVolume: 150000,
    url: 'https://twitter.com/search?q=%23AItrending',
  };

  beforeEach(async () => {
    baseService = {
      ACTORS: {
        TWITTER_SCRAPER: 'quacker/twitter-scraper',
        TWITTER_TRENDS: 'quacker/twitter-trends-scraper',
      },
      calculateGrowthRate: vi.fn().mockReturnValue(65),
      getApiToken: vi.fn().mockReturnValue('test-token'),
      loggerService: { error: vi.fn(), log: vi.fn() },
      runActor: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApifyTwitterService,
        { provide: ApifyBaseService, useValue: baseService },
        { provide: ResearchCollectionRunner, useValue: researchRunner },
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
    expect(result[0].metadata.trendType).toBe('hashtag');
  });

  it('getTwitterTrends rethrows provider failures', async () => {
    baseService.runActor.mockRejectedValue(new Error('API error'));
    await expect(service.getTwitterTrends()).rejects.toThrow('API error');
  });

  it('getTwitterMentions normalizes tweets', async () => {
    baseService.runActor.mockResolvedValue([mockTweet]);
    const result = await service.getTwitterMentions('testuser', { limit: 20 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      authorUsername: 'testuser',
      id: '123456',
      text: 'Hello world #ai',
    });
    expect(result[0].metrics.likes).toBe(100);
  });

  it('getTwitterMentions filters by sinceId', async () => {
    baseService.runActor.mockResolvedValue([
      { ...mockTweet, id: '100' },
      { ...mockTweet, id: '200' },
    ]);
    const result = await service.getTwitterMentions('testuser', {
      sinceId: '150',
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('200');
  });

  it('getTwitterMentions returns empty on error', async () => {
    baseService.runActor.mockRejectedValue(new Error('fail'));
    const result = await service.getTwitterMentions('user');
    expect(result).toEqual([]);
  });

  it('retains explicit pin and promotion flags and leaves missing flags unknown', async () => {
    baseService.runActor.mockResolvedValue([
      { ...mockTweet, is_pinned: true, is_sponsored: false },
      mockTweet,
    ]);
    const result = await service.getTwitterUserTimeline('testuser');
    expect(result[0]).toMatchObject({ isPinned: true, isPromoted: false });
    expect(result[1]).toMatchObject({ isPinned: null, isPromoted: null });
  });

  it('leaves invalid or missing publication dates absent', async () => {
    baseService.runActor.mockResolvedValue([
      { ...mockTweet, created_at: undefined },
      { ...mockTweet, created_at: 'invalid' },
    ]);
    const result = await service.getTwitterUserTimeline('testuser');
    expect(result.map((tweet) => tweet.createdAt)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('getTwitterUserTimeline fetches user tweets', async () => {
    baseService.runActor.mockResolvedValue([mockTweet]);
    const result = await service.getTwitterUserTimeline('testuser');
    expect(result).toHaveLength(1);
    expect(baseService.runActor).toHaveBeenCalledWith(
      'quacker/twitter-scraper',
      expect.objectContaining({ handles: ['testuser'] }),
    );
  });

  it('getTwitterUserTimeline throws when Apify token is missing', async () => {
    baseService.getApiToken.mockReturnValue(null);
    await expect(service.getTwitterUserTimeline('user')).rejects.toThrow(
      /APIFY_API_TOKEN/,
    );
  });

  it('getTwitterUserTimeline rethrows actor failures', async () => {
    baseService.runActor.mockRejectedValue(new Error('actor down'));
    await expect(service.getTwitterUserTimeline('user')).rejects.toThrow(
      'actor down',
    );
  });

  it('getTwitterUserTimeline filters by sinceId', async () => {
    baseService.runActor.mockResolvedValue([
      { ...mockTweet, id: '50' },
      { ...mockTweet, id: '300' },
    ]);
    const result = await service.getTwitterUserTimeline('user', {
      sinceId: '100',
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('300');
  });

  it('getTwitterTweetReplies filters only replies to the tweet', async () => {
    baseService.runActor.mockResolvedValue([
      { ...mockTweet, id: 'reply-1', in_reply_to_status_id_str: 'tweet-1' },
      { ...mockTweet, id: 'other', in_reply_to_status_id_str: 'tweet-2' },
    ]);
    const result = await service.getTwitterTweetReplies('tweet-1');
    expect(result).toHaveLength(1);
    expect(result[0].inReplyToTweetId).toBe('tweet-1');
  });

  it('getTwitterTweetReplies returns empty on error', async () => {
    baseService.runActor.mockRejectedValue(new Error('fail'));
    const result = await service.getTwitterTweetReplies('tweet-1');
    expect(result).toEqual([]);
  });

  it('searchTwitterTweets passes query and filters by sinceId', async () => {
    baseService.runActor.mockResolvedValue([{ ...mockTweet, id: '500' }]);
    const result = await service.searchTwitterTweets('AI news', {
      limit: 30,
      sinceId: '400',
    });
    expect(result).toHaveLength(1);
    expect(baseService.runActor).toHaveBeenCalledWith(
      'quacker/twitter-scraper',
      expect.objectContaining({
        maxTweets: 30,
        searchTerms: ['AI news'],
      }),
    );
  });

  it('searchTwitterTweets returns empty on error', async () => {
    baseService.runActor.mockRejectedValue(new Error('fail'));
    const result = await service.searchTwitterTweets('query');
    expect(result).toEqual([]);
  });

  it('normalizes tweet with missing user fields gracefully', async () => {
    baseService.runActor.mockResolvedValue([
      {
        ...mockTweet,
        entities: {},
        user: { screen_name: 'anon' },
      },
    ]);
    const result = await service.getTwitterMentions('anon');
    expect(result[0].authorUsername).toBe('anon');
    expect(result[0].hashtags).toEqual([]);
  });

  it('normalizes trend without hashtag prefix as topic type', async () => {
    baseService.runActor.mockResolvedValue([
      { ...mockTrend, name: 'Breaking News' },
    ]);
    const result = await service.getTwitterTrends();
    expect(result[0].metadata.trendType).toBe('topic');
  });
  it('governs hosted timelines before legacy token admission with unchanged input', async () => {
    baseService.getApiToken.mockReturnValue(null);
    researchRunner.run.mockResolvedValue([]);
    await expect(
      service.getTwitterUserTimeline(
        'creator',
        { limit: 7 },
        { organizationId: 'org-1', origin: 'social-source' },
      ),
    ).resolves.toEqual([]);
    expect(researchRunner.run).toHaveBeenCalledWith(
      'org-1',
      baseService.ACTORS.TWITTER_SCRAPER,
      { handles: ['creator'], maxTweets: 7, sort: 'Latest' },
      { tokenMode: 'hosted-only', requestScope: 'social-source-hosted' },
    );
    expect(baseService.runActor).not.toHaveBeenCalled();
    expect(baseService.getApiToken).not.toHaveBeenCalled();
  });
  it('governs single posts with the existing actor input', async () => {
    researchRunner.run.mockResolvedValue([{ id: '123' }]);
    baseService.getApiToken.mockReturnValue(null);
    await expect(
      service.getTweetByUrl('https://x.com/creator/status/123', '123', {
        organizationId: 'org-1',
        origin: 'social-source',
      }),
    ).resolves.toMatchObject({ id: '123' });
    expect(researchRunner.run).toHaveBeenCalledWith(
      'org-1',
      baseService.ACTORS.TWITTER_SCRAPER,
      expect.any(Object),
      { tokenMode: 'hosted-only', requestScope: 'social-source-hosted' },
    );
    expect(baseService.runActor).not.toHaveBeenCalled();
  });
});
