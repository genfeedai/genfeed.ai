import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import type {
  CampaignDiscoveryConfig,
  OutreachCampaignDocument,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { CampaignDiscoveryService } from '@api/services/campaign/campaign-discovery.service';
import {
  type SocialContentData,
  SocialMonitorService,
} from '@api/services/reply-bot/social-monitor.service';
import {
  CampaignDiscoverySource,
  CampaignPlatform,
  CampaignTargetType,
  ReplyBotPlatform,
  SocialContentType,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CampaignDiscoveryService', () => {
  let service: CampaignDiscoveryService;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockSocialMonitorService = {
    searchContent: vi.fn(),
  };

  const mockCampaignTargetsService = {
    createMany: vi.fn(),
    targetExists: vi.fn(),
  };

  const orgId = 'test-object-id';
  const campaignId = 'test-object-id';

  const makeConfig = (
    overrides: Partial<CampaignDiscoveryConfig> = {},
  ): CampaignDiscoveryConfig =>
    ({
      excludeAuthors: [],
      hashtags: [],
      keywords: ['ai'],
      maxAgeHours: 24,
      maxEngagement: 10000,
      minEngagement: 0,
      minRelevanceScore: 0,
      subreddits: [],
      ...overrides,
    }) as CampaignDiscoveryConfig;

  const makeCampaign = (
    overrides: Partial<OutreachCampaignDocument> = {},
  ): OutreachCampaignDocument =>
    ({
      _id: campaignId,
      discoveryConfig: makeConfig(),
      organization: orgId,
      platform: CampaignPlatform.TWITTER,
      ...overrides,
    }) as unknown as OutreachCampaignDocument;

  const makeContent = (
    overrides: Partial<SocialContentData> = {},
  ): SocialContentData => ({
    authorId: 'author1',
    authorUsername: 'tweetguy',
    contentType: SocialContentType.TWEET,
    contentUrl: 'https://x.com/tweetguy/status/1',
    createdAt: new Date(),
    id: `tweet-${Math.random().toString(36).slice(2, 8)}`,
    metrics: { comments: 5, likes: 100, shares: 20 },
    platform: ReplyBotPlatform.TWITTER,
    text: 'AI is amazing',
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignDiscoveryService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: SocialMonitorService, useValue: mockSocialMonitorService },
        {
          provide: CampaignTargetsService,
          useValue: mockCampaignTargetsService,
        },
      ],
    }).compile();

    service = module.get<CampaignDiscoveryService>(CampaignDiscoveryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('discoverTargets', () => {
    it('should return empty array when no discoveryConfig', async () => {
      const campaign = makeCampaign({ discoveryConfig: undefined });

      const result = await service.discoverTargets(campaign);

      expect(result).toEqual([]);
      expect(mockSocialMonitorService.searchContent).not.toHaveBeenCalled();
    });

    it('should discover targets by keywords', async () => {
      const content = [makeContent({ id: 'tw1' })];
      mockSocialMonitorService.searchContent.mockResolvedValue(content);
      mockCampaignTargetsService.targetExists.mockResolvedValue(false);

      const campaign = makeCampaign({
        discoveryConfig: makeConfig({ keywords: ['ai'] }),
      });

      const result = await service.discoverTargets(campaign, 50);

      expect(result).toHaveLength(1);
      expect(result[0].externalId).toBe('tw1');
      expect(result[0].platform).toBe(CampaignPlatform.TWITTER);
      expect(result[0].targetType).toBe(CampaignTargetType.TWEET);
      expect(result[0].discoverySource).toBe(
        CampaignDiscoverySource.KEYWORD_SEARCH,
      );
      expect(result[0].matchedKeyword).toBe('ai');
    });

    it('should discover targets by hashtags', async () => {
      const content = [makeContent({ id: 'tw2' })];
      mockSocialMonitorService.searchContent.mockResolvedValue(content);
      mockCampaignTargetsService.targetExists.mockResolvedValue(false);

      const campaign = makeCampaign({
        discoveryConfig: makeConfig({
          hashtags: ['machinelearning'],
          keywords: [],
        }),
      });

      const result = await service.discoverTargets(campaign, 50);

      expect(result).toHaveLength(1);
      expect(result[0].discoverySource).toBe(CampaignDiscoverySource.HASHTAG);
      // Should prepend # if missing
      expect(mockSocialMonitorService.searchContent).toHaveBeenCalledWith(
        ReplyBotPlatform.TWITTER,
        '#machinelearning',
        expect.objectContaining({ limit: expect.any(Number) }),
      );
    });

    it('should search by subreddits for Reddit campaigns', async () => {
      const content = [makeContent({ id: 'rd1' })];
      mockSocialMonitorService.searchContent.mockResolvedValue(content);
      mockCampaignTargetsService.targetExists.mockResolvedValue(false);

      const campaign = makeCampaign({
        discoveryConfig: makeConfig({
          keywords: [],
          subreddits: ['technology'],
        }),
        platform: CampaignPlatform.REDDIT,
      });

      const result = await service.discoverTargets(campaign, 50);

      expect(result).toHaveLength(1);
      expect(result[0].targetType).toBe(CampaignTargetType.REDDIT_POST);
      expect(mockSocialMonitorService.searchContent).toHaveBeenCalledWith(
        ReplyBotPlatform.REDDIT,
        'r/technology',
        expect.any(Object),
      );
    });

    it('should filter out content that is too old', async () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 48);
      const content = [makeContent({ createdAt: oldDate, id: 'old1' })];
      mockSocialMonitorService.searchContent.mockResolvedValue(content);
      mockCampaignTargetsService.targetExists.mockResolvedValue(false);

      const campaign = makeCampaign({
        discoveryConfig: makeConfig({ maxAgeHours: 24 }),
      });

      const result = await service.discoverTargets(campaign, 50);

      expect(result).toHaveLength(0);
    });

    it('should filter out content below minEngagement', async () => {
      const content = [
        makeContent({
          id: 'low',
          metrics: { comments: 0, likes: 1, shares: 0 },
        }),
      ];
      mockSocialMonitorService.searchContent.mockResolvedValue(content);
      mockCampaignTargetsService.targetExists.mockResolvedValue(false);

      const campaign = makeCampaign({
        discoveryConfig: makeConfig({ minEngagement: 50 }),
      });

      const result = await service.discoverTargets(campaign, 50);

      expect(result).toHaveLength(0);
    });

    it('should filter out content above maxEngagement', async () => {
      const content = [
        makeContent({
          id: 'viral',
          metrics: { comments: 0, likes: 50000, shares: 10000 },
        }),
      ];
      mockSocialMonitorService.searchContent.mockResolvedValue(content);
      mockCampaignTargetsService.targetExists.mockResolvedValue(false);

      const campaign = makeCampaign({
        discoveryConfig: makeConfig({ maxEngagement: 1000 }),
      });

      const result = await service.discoverTargets(campaign, 50);

      expect(result).toHaveLength(0);
    });

    it('should filter out excluded authors', async () => {
      const content = [makeContent({ authorUsername: 'SpamBot', id: 'sp1' })];
      mockSocialMonitorService.searchContent.mockResolvedValue(content);
      mockCampaignTargetsService.targetExists.mockResolvedValue(false);

      const campaign = makeCampaign({
        discoveryConfig: makeConfig({ excludeAuthors: ['spambot'] }),
      });

      const result = await service.discoverTargets(campaign, 50);

      expect(result).toHaveLength(0);
    });

    it('should deduplicate targets by externalId', async () => {
      const content = [
        makeContent({ id: 'dup1' }),
        makeContent({ id: 'dup1' }),
        makeContent({ id: 'unique' }),
      ];
      mockSocialMonitorService.searchContent.mockResolvedValue(content);
      mockCampaignTargetsService.targetExists.mockResolvedValue(false);

      const campaign = makeCampaign();

      const result = await service.discoverTargets(campaign, 50);

      expect(result).toHaveLength(2);
    });

    it('should filter out already existing targets', async () => {
      const content = [
        makeContent({ id: 'existing1' }),
        makeContent({ id: 'new1' }),
      ];
      mockSocialMonitorService.searchContent.mockResolvedValue(content);
      mockCampaignTargetsService.targetExists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const campaign = makeCampaign();

      const result = await service.discoverTargets(campaign, 50);

      expect(result).toHaveLength(1);
      expect(result[0].externalId).toBe('new1');
    });

    it('should sort by relevance score descending', async () => {
      const recentDate = new Date();
      const olderDate = new Date();
      olderDate.setHours(olderDate.getHours() - 12);

      const content = [
        makeContent({
          createdAt: olderDate,
          id: 'low-score',
          metrics: { comments: 0, likes: 5, shares: 0 },
        }),
        makeContent({
          createdAt: recentDate,
          id: 'high-score',
          metrics: { comments: 10, likes: 600, shares: 100 },
        }),
      ];
      mockSocialMonitorService.searchContent.mockResolvedValue(content);
      mockCampaignTargetsService.targetExists.mockResolvedValue(false);

      const campaign = makeCampaign();

      const result = await service.discoverTargets(campaign, 50);

      expect(result[0].externalId).toBe('high-score');
      expect(result[0].relevanceScore).toBeGreaterThan(
        result[1].relevanceScore,
      );
    });

    it('should throw when searchContent fails', async () => {
      mockSocialMonitorService.searchContent.mockRejectedValue(
        new Error('API down'),
      );

      const campaign = makeCampaign();

      await expect(service.discoverTargets(campaign)).rejects.toThrow(
        'API down',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('addDiscoveredTargetsToCampaign', () => {
    it('should create targets and return count', async () => {
      const targets = [
        {
          authorId: 'a1',
          authorUsername: 'user1',
          contentCreatedAt: new Date(),
          contentText: 'text',
          contentUrl: 'https://x.com/1',
          discoverySource: CampaignDiscoverySource.KEYWORD_SEARCH,
          externalId: 'ext1',
          likes: 10,
          matchedKeyword: 'ai',
          platform: CampaignPlatform.TWITTER,
          relevanceScore: 0.8,
          replies: 2,
          retweets: 5,
          targetType: CampaignTargetType.TWEET,
        },
      ];
      mockCampaignTargetsService.createMany.mockResolvedValue(targets);

      const campaign = makeCampaign();
      const count = await service.addDiscoveredTargetsToCampaign(
        campaign,
        targets,
      );

      expect(count).toBe(1);
      expect(mockCampaignTargetsService.createMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ externalId: 'ext1' }),
        ]),
      );
    });

    it('should throw when createMany fails', async () => {
      mockCampaignTargetsService.createMany.mockRejectedValue(
        new Error('Insert failed'),
      );

      const campaign = makeCampaign();

      await expect(
        service.addDiscoveredTargetsToCampaign(campaign, []),
      ).rejects.toThrow('Insert failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
