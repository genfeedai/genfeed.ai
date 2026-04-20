import { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { ConfigService } from '@api/config/config.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { RateLimitService } from '@api/services/reply-bot/rate-limit.service';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import { SocialMonitorService } from '@api/services/reply-bot/social-monitor.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ReplyBotOrchestratorService', () => {
  let service: ReplyBotOrchestratorService;

  const mockConfigService = {
    get: vi.fn(() => 'test-value'),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockSocialMonitorService = {
    filterContent: vi.fn(),
    filterUnprocessedContent: vi.fn(),
    getContentComments: vi.fn(),
    getUserMentions: vi.fn(),
    getUserTimeline: vi.fn(),
  };

  const mockReplyGenerationService = {
    generateDm: vi.fn(),
    generateReply: vi.fn(),
  };

  const mockBotActionExecutorService = {
    postQuoteTweet: vi.fn(),
    postReply: vi.fn(),
    postTweet: vi.fn(),
    sendDm: vi.fn(),
  };

  const mockRateLimitService = {
    checkRateLimit: vi.fn(),
    incrementCounter: vi.fn(),
    isWithinSchedule: vi.fn(),
  };

  const mockReplyBotConfigsService = {
    findActive: vi.fn(),
    findOneById: vi.fn(),
  };

  const mockMonitoredAccountsService = {
    findByBotConfig: vi.fn(),
    updateLastProcessed: vi.fn(),
  };

  const mockBotActivitiesService = {
    create: vi.fn(),
    updateStatus: vi.fn(),
  };

  const mockProcessedTweetsService = {
    markAsProcessed: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplyBotOrchestratorService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: SocialMonitorService, useValue: mockSocialMonitorService },
        {
          provide: ReplyGenerationService,
          useValue: mockReplyGenerationService,
        },
        {
          provide: BotActionExecutorService,
          useValue: mockBotActionExecutorService,
        },
        { provide: RateLimitService, useValue: mockRateLimitService },
        {
          provide: ReplyBotConfigsService,
          useValue: mockReplyBotConfigsService,
        },
        {
          provide: MonitoredAccountsService,
          useValue: mockMonitoredAccountsService,
        },
        { provide: BotActivitiesService, useValue: mockBotActivitiesService },
        {
          provide: ProcessedTweetsService,
          useValue: mockProcessedTweetsService,
        },
      ],
    }).compile();

    service = module.get<ReplyBotOrchestratorService>(
      ReplyBotOrchestratorService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processOrganizationBots', () => {
    const orgId = '507f1f77bcf86cd799439011';
    const credential = {
      accessToken: 'token-123',
      platform: 'twitter' as const,
      username: 'testuser',
    };

    it('should return empty array when no active bots found', async () => {
      mockReplyBotConfigsService.findActive.mockResolvedValue([]);

      const results = await service.processOrganizationBots(orgId, credential);

      expect(results).toEqual([]);
      expect(mockReplyBotConfigsService.findActive).toHaveBeenCalledWith(orgId);
    });

    it('should process each active bot and return results', async () => {
      const botConfigs = [
        { _id: 'test-object-id', name: 'Bot 1', type: 'reply_guy' },
        { _id: 'test-object-id', name: 'Bot 2', type: 'account_monitor' },
      ];
      mockReplyBotConfigsService.findActive.mockResolvedValue(botConfigs);
      mockRateLimitService.isWithinSchedule.mockReturnValue(false);

      const results = await service.processOrganizationBots(orgId, credential);

      expect(results).toHaveLength(2);
      expect(mockRateLimitService.isWithinSchedule).toHaveBeenCalledTimes(2);
    });

    it('should propagate errors from findActive', async () => {
      mockReplyBotConfigsService.findActive.mockRejectedValue(
        new Error('DB connection failed'),
      );

      await expect(
        service.processOrganizationBots(orgId, credential),
      ).rejects.toThrow('DB connection failed');
    });
  });

  describe('processSingleBot', () => {
    const orgId = '507f1f77bcf86cd799439011';
    const credential = {
      accessToken: 'token-123',
      platform: 'twitter' as const,
      username: 'testuser',
    };

    const makeBotConfig = (overrides = {}) => ({
      _id: 'test-object-id',
      actionType: 'reply_only',
      context: 'test context',
      customInstructions: 'be nice',
      replyLength: 'medium',
      replyTone: 'friendly',
      type: 'reply_guy',
      ...overrides,
    });

    it('should return result with zero counts when outside schedule', async () => {
      const botConfig = makeBotConfig();
      mockRateLimitService.isWithinSchedule.mockReturnValue(false);

      const result = await service.processSingleBot(
        botConfig as never,
        orgId,
        credential,
      );

      expect(result.contentProcessed).toBe(0);
      expect(result.repliesSent).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
      expect(mockSocialMonitorService.getUserMentions).not.toHaveBeenCalled();
    });

    it('should fetch mentions for REPLY_GUY bot type', async () => {
      const botConfig = makeBotConfig({ type: 'reply_guy' });
      mockRateLimitService.isWithinSchedule.mockReturnValue(true);
      mockSocialMonitorService.getUserMentions.mockResolvedValue([]);
      mockSocialMonitorService.filterUnprocessedContent.mockResolvedValue([]);

      await service.processSingleBot(botConfig as never, orgId, credential);

      expect(mockSocialMonitorService.getUserMentions).toHaveBeenCalled();
    });

    it('should fetch monitored account content for ACCOUNT_MONITOR bot type', async () => {
      const botConfig = makeBotConfig({ type: 'account_monitor' });
      mockRateLimitService.isWithinSchedule.mockReturnValue(true);
      mockMonitoredAccountsService.findByBotConfig.mockResolvedValue([]);

      await service.processSingleBot(botConfig as never, orgId, credential);

      expect(mockMonitoredAccountsService.findByBotConfig).toHaveBeenCalled();
    });

    it('should fetch comments for COMMENT_RESPONDER bot type', async () => {
      const botConfig = makeBotConfig({ type: 'comment_responder' });
      mockRateLimitService.isWithinSchedule.mockReturnValue(true);
      mockSocialMonitorService.getUserTimeline.mockResolvedValue([]);
      mockSocialMonitorService.filterUnprocessedContent.mockResolvedValue([]);

      await service.processSingleBot(botConfig as never, orgId, credential);

      expect(mockSocialMonitorService.getUserTimeline).toHaveBeenCalled();
    });

    it('should increment skipped count when rate limited', async () => {
      const botConfig = makeBotConfig();
      const contentItem = {
        authorId: 'author-1',
        authorUsername: 'author',
        contentType: 'tweet',
        createdAt: new Date(),
        id: 'tweet-1',
        platform: 'twitter',
        text: 'Hello',
      };

      mockRateLimitService.isWithinSchedule.mockReturnValue(true);
      mockSocialMonitorService.getUserMentions.mockResolvedValue([contentItem]);
      mockSocialMonitorService.filterUnprocessedContent.mockResolvedValue([
        contentItem,
      ]);
      mockRateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        reason: 'rate_limited',
      });
      mockBotActivitiesService.create.mockResolvedValue({
        _id: 'test-object-id',
      });

      const result = await service.processSingleBot(
        botConfig as never,
        orgId,
        credential,
      );

      expect(result.skipped).toBe(1);
      expect(result.repliesSent).toBe(0);
    });

    it('should increment repliesSent on successful reply post', async () => {
      const botConfig = makeBotConfig({ actionType: 'reply_only' });
      const contentItem = {
        authorId: 'author-1',
        authorUsername: 'author',
        contentType: 'tweet',
        createdAt: new Date(),
        id: 'tweet-1',
        platform: 'twitter',
        text: 'Hello',
      };

      mockRateLimitService.isWithinSchedule.mockReturnValue(true);
      mockSocialMonitorService.getUserMentions.mockResolvedValue([contentItem]);
      mockSocialMonitorService.filterUnprocessedContent.mockResolvedValue([
        contentItem,
      ]);
      mockRateLimitService.checkRateLimit.mockResolvedValue({ allowed: true });
      mockBotActivitiesService.create.mockResolvedValue({
        _id: 'test-object-id',
      });
      mockReplyGenerationService.generateReply.mockResolvedValue(
        'Generated reply text',
      );
      mockBotActionExecutorService.postReply.mockResolvedValue({
        contentId: 'reply-1',
        contentUrl: 'https://x.com/test/status/reply-1',
        success: true,
      });
      mockBotActivitiesService.updateStatus.mockResolvedValue(undefined);
      mockProcessedTweetsService.markAsProcessed.mockResolvedValue(undefined);

      const result = await service.processSingleBot(
        botConfig as never,
        orgId,
        credential,
      );

      expect(result.repliesSent).toBe(1);
      expect(result.errors).toBe(0);
      expect(mockRateLimitService.incrementCounter).toHaveBeenCalled();
      expect(mockProcessedTweetsService.markAsProcessed).toHaveBeenCalledWith(
        'tweet-1',
        orgId,
        'reply_guy',
        botConfig._id.toString(),
      );
    });

    it('should increment errors on failed reply post', async () => {
      const botConfig = makeBotConfig({ actionType: 'reply_only' });
      const contentItem = {
        authorId: 'author-1',
        authorUsername: 'author',
        contentType: 'tweet',
        createdAt: new Date(),
        id: 'tweet-1',
        platform: 'twitter',
        text: 'Hello',
      };

      mockRateLimitService.isWithinSchedule.mockReturnValue(true);
      mockSocialMonitorService.getUserMentions.mockResolvedValue([contentItem]);
      mockSocialMonitorService.filterUnprocessedContent.mockResolvedValue([
        contentItem,
      ]);
      mockRateLimitService.checkRateLimit.mockResolvedValue({ allowed: true });
      mockBotActivitiesService.create.mockResolvedValue({
        _id: 'test-object-id',
      });
      mockReplyGenerationService.generateReply.mockResolvedValue(
        'Generated reply',
      );
      mockBotActionExecutorService.postReply.mockResolvedValue({
        error: 'Twitter API error',
        success: false,
      });
      mockBotActivitiesService.updateStatus.mockResolvedValue(undefined);

      const result = await service.processSingleBot(
        botConfig as never,
        orgId,
        credential,
      );

      expect(result.errors).toBe(1);
      expect(result.repliesSent).toBe(0);
      expect(mockBotActivitiesService.updateStatus).toHaveBeenCalledWith(
        expect.any(String),
        orgId,
        expect.objectContaining({
          errorMessage: 'Twitter API error',
          status: 'failed',
        }),
      );
    });

    it('should catch and return result when processing throws', async () => {
      const botConfig = makeBotConfig();
      mockRateLimitService.isWithinSchedule.mockImplementation(() => {
        throw new Error('Unexpected failure');
      });

      const result = await service.processSingleBot(
        botConfig as never,
        orgId,
        credential,
      );

      expect(result.contentProcessed).toBe(0);
      expect(result.errors).toBe(0);
    });
  });

  describe('testReplyGeneration', () => {
    const orgId = '507f1f77bcf86cd799439011';
    const botConfigId = '507f1f77bcf86cd799439022';
    const testContent = { author: 'testauthor', content: 'Test tweet' };

    it('should throw when bot config not found', async () => {
      mockReplyBotConfigsService.findOneById.mockResolvedValue(null);

      await expect(
        service.testReplyGeneration(botConfigId, orgId, testContent),
      ).rejects.toThrow('Bot configuration not found');
    });

    it('should return generated reply text', async () => {
      mockReplyBotConfigsService.findOneById.mockResolvedValue({
        _id: botConfigId,
        actionType: 'reply_only',
        context: 'context',
        customInstructions: 'instructions',
        replyLength: 'medium',
        replyTone: 'friendly',
      });
      mockReplyGenerationService.generateReply.mockResolvedValue(
        'Generated reply!',
      );

      const result = await service.testReplyGeneration(
        botConfigId,
        orgId,
        testContent,
      );

      expect(result.replyText).toBe('Generated reply!');
      expect(result.dmText).toBeUndefined();
    });

    it('should also generate DM when action type is REPLY_AND_DM', async () => {
      mockReplyBotConfigsService.findOneById.mockResolvedValue({
        _id: botConfigId,
        actionType: 'reply_and_dm',
        context: 'context',
        customInstructions: 'instructions',
        dmConfig: {
          context: 'dm context',
          ctaLink: 'https://example.com',
          customInstructions: 'dm instructions',
          offer: 'Free trial',
        },
        replyLength: 'medium',
        replyTone: 'friendly',
      });
      mockReplyGenerationService.generateReply.mockResolvedValue(
        'Generated reply!',
      );
      mockReplyGenerationService.generateDm.mockResolvedValue('Generated DM!');

      const result = await service.testReplyGeneration(
        botConfigId,
        orgId,
        testContent,
      );

      expect(result.replyText).toBe('Generated reply!');
      expect(result.dmText).toBe('Generated DM!');
      expect(mockReplyGenerationService.generateDm).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'dm context',
          organizationId: orgId,
          replyText: 'Generated reply!',
          tweetAuthor: 'testauthor',
          tweetContent: 'Test tweet',
        }),
      );
    });
  });
});
