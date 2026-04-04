import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { TwitterPipelineService } from '@api/services/twitter-pipeline/twitter-pipeline.service';
import type {
  ITwitterSearchResult,
  ITwitterVoiceConfig,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('TwitterPipelineService', () => {
  let service: TwitterPipelineService;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockTwitterService = {
    searchRecentTweets: vi.fn(),
  };

  const mockOpenRouterService = {
    chat: vi.fn(),
    chatCompletion: vi.fn(),
  };

  const mockBotActionExecutorService = {
    postQuoteTweet: vi.fn(),
    postReply: vi.fn(),
    postTweet: vi.fn(),
  };

  const mockCredentialsService = {
    findOne: vi.fn(),
  };

  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();

  const fakeTweet: ITwitterSearchResult = {
    authorName: 'Test User',
    authorUsername: 'testuser',
    createdAt: new Date().toISOString(),
    engagement: 150,
    id: 'tweet1',
    likes: 100,
    quotes: 10,
    replies: 20,
    retweets: 30,
    text: 'AI is changing everything',
  };

  const fakeVoice: ITwitterVoiceConfig = {
    description: 'Tech enthusiast, witty, engaging',
    handle: '@genfeedbot',
    searchQuery: 'AI tools',
  };

  const fakeCredential = {
    _id: new Types.ObjectId(),
    accessToken: 'at',
    accessTokenSecret: 'ats',
    externalHandle: 'genfeedbot',
    externalId: 'ext1',
    refreshToken: 'rt',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitterPipelineService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: TwitterService, useValue: mockTwitterService },
        { provide: OpenRouterService, useValue: mockOpenRouterService },
        {
          provide: BotActionExecutorService,
          useValue: mockBotActionExecutorService,
        },
        { provide: CredentialsService, useValue: mockCredentialsService },
      ],
    }).compile();

    service = module.get<TwitterPipelineService>(TwitterPipelineService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('search', () => {
    it('should search recent tweets and return results', async () => {
      mockTwitterService.searchRecentTweets.mockResolvedValue([fakeTweet]);

      const results = await service.search(orgId, brandId, 'AI tools');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('tweet1');
      expect(mockTwitterService.searchRecentTweets).toHaveBeenCalledWith(
        'AI tools',
        {
          maxResults: 10,
          sortOrder: 'relevancy',
        },
      );
      expect(mockLogger.log).toHaveBeenCalled();
    });

    it('should use custom maxResults', async () => {
      mockTwitterService.searchRecentTweets.mockResolvedValue([]);

      await service.search(orgId, brandId, 'AI', { maxResults: 25 });

      expect(mockTwitterService.searchRecentTweets).toHaveBeenCalledWith('AI', {
        maxResults: 25,
        sortOrder: 'relevancy',
      });
    });

    it('should throw and log on search failure', async () => {
      mockTwitterService.searchRecentTweets.mockRejectedValue(
        new Error('Twitter API error'),
      );

      await expect(service.search(orgId, brandId, 'AI')).rejects.toThrow(
        'Twitter API error',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('draft', () => {
    it('should generate opportunities from search results', async () => {
      const grokResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                opportunities: [
                  {
                    reason: 'good engagement',
                    suggestedText: 'Great insight!',
                    tweetIndex: 1,
                    type: 'reply',
                  },
                  {
                    reason: 'trending topic',
                    suggestedText: 'AI is indeed powerful',
                    type: 'original',
                  },
                ],
              }),
            },
          },
        ],
      };
      mockOpenRouterService.chatCompletion.mockResolvedValue(grokResponse);

      const opportunities = await service.draft(orgId, [fakeTweet], fakeVoice);

      expect(opportunities).toHaveLength(2);
      expect(opportunities[0].type).toBe('reply');
      expect(opportunities[0].suggestedText).toBe('Great insight!');
      expect(opportunities[0].targetTweetId).toBe('tweet1');
      expect(opportunities[0].verified).toBe(true);
      expect(opportunities[1].type).toBe('original');
      expect(opportunities[1].verified).toBe(false);
    });

    it('should handle markdown-fenced JSON from Grok', async () => {
      const grokResponse = {
        choices: [
          {
            message: {
              content:
                '```json\n{"opportunities": [{"type": "reply", "tweetIndex": 1, "suggestedText": "Nice!", "reason": "ok"}]}\n```',
            },
          },
        ],
      };
      mockOpenRouterService.chatCompletion.mockResolvedValue(grokResponse);

      const opportunities = await service.draft(orgId, [fakeTweet], fakeVoice);

      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].suggestedText).toBe('Nice!');
    });

    it('should return empty array on invalid JSON', async () => {
      const grokResponse = {
        choices: [{ message: { content: 'not json at all' } }],
      };
      mockOpenRouterService.chatCompletion.mockResolvedValue(grokResponse);

      const opportunities = await service.draft(orgId, [fakeTweet], fakeVoice);

      expect(opportunities).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return empty array when no opportunities key', async () => {
      const grokResponse = {
        choices: [{ message: { content: '{"something": "else"}' } }],
      };
      mockOpenRouterService.chatCompletion.mockResolvedValue(grokResponse);

      const opportunities = await service.draft(orgId, [fakeTweet], fakeVoice);

      expect(opportunities).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw on openrouter failure', async () => {
      mockOpenRouterService.chatCompletion.mockRejectedValue(
        new Error('API timeout'),
      );

      await expect(
        service.draft(orgId, [fakeTweet], fakeVoice),
      ).rejects.toThrow('API timeout');
    });

    it('should handle empty choices array', async () => {
      mockOpenRouterService.chatCompletion.mockResolvedValue({ choices: [] });

      const opportunities = await service.draft(orgId, [fakeTweet], fakeVoice);

      // content will be '', which is not valid JSON → empty array
      expect(opportunities).toEqual([]);
    });
  });

  describe('publish', () => {
    it('should publish a reply', async () => {
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockBotActionExecutorService.postReply.mockResolvedValue({
        contentId: 'reply1',
        contentUrl: 'https://x.com/reply1',
        success: true,
      });

      const result = await service.publish(orgId, brandId, {
        targetTweetId: 'tweet1',
        text: 'Great point!',
        type: 'reply',
      });

      expect(result.success).toBe(true);
      expect(result.tweetId).toBe('reply1');
      expect(mockBotActionExecutorService.postReply).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'at', username: 'genfeedbot' }),
        expect.objectContaining({ id: 'tweet1' }),
        'Great point!',
      );
    });

    it('should publish a quote tweet', async () => {
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockBotActionExecutorService.postQuoteTweet.mockResolvedValue({
        contentId: 'qt1',
        contentUrl: 'https://x.com/qt1',
        success: true,
      });

      const result = await service.publish(orgId, brandId, {
        targetTweetId: 'tweet1',
        text: 'This is so true',
        type: 'quote',
      });

      expect(result.success).toBe(true);
      expect(result.tweetId).toBe('qt1');
    });

    it('should publish an original tweet', async () => {
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockBotActionExecutorService.postTweet.mockResolvedValue({
        contentId: 'tw1',
        contentUrl: 'https://x.com/tw1',
        success: true,
      });

      const result = await service.publish(orgId, brandId, {
        text: 'Hello world',
        type: 'original',
      });

      expect(result.success).toBe(true);
      expect(result.tweetId).toBe('tw1');
    });

    it('should return error when credential not found', async () => {
      mockCredentialsService.findOne.mockResolvedValue(null);

      const result = await service.publish(orgId, brandId, {
        text: 'Hello',
        type: 'original',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Twitter credential not found');
    });

    it('should return error when reply has no targetTweetId', async () => {
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);

      const result = await service.publish(orgId, brandId, {
        text: 'reply text',
        type: 'reply',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('targetTweetId required for reply');
    });

    it('should return error when quote has no targetTweetId', async () => {
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);

      const result = await service.publish(orgId, brandId, {
        text: 'quote text',
        type: 'quote',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('targetTweetId required for quote');
    });

    it('should catch and return errors from bot action executor', async () => {
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockBotActionExecutorService.postTweet.mockRejectedValue(
        new Error('Network error'),
      );

      const result = await service.publish(orgId, brandId, {
        text: 'test',
        type: 'original',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle unknown publish type', async () => {
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);

      const result = await service.publish(orgId, brandId, {
        text: 'test',
        type: 'unknown' as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown publish type');
    });
  });
});
