import type { CampaignTargetDocument } from '@api/collections/campaign-targets/schemas/campaign-target.schema';
import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type {
  CampaignAiConfig,
  OutreachCampaignDocument,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import {
  CampaignPlatform,
  CampaignSkipReason,
  CampaignStatus,
  ReplyLength,
  ReplyTone,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CampaignExecutorService', () => {
  let service: CampaignExecutorService;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockOutreachCampaignsService = {
    canReply: vi.fn(),
    findOne: vi.fn(),
    incrementFailedCounter: vi.fn(),
    incrementReplyCounters: vi.fn(),
    incrementSkippedCounter: vi.fn(),
    patch: vi.fn(),
  };

  const mockCampaignTargetsService = {
    getPendingTargets: vi.fn(),
    markAsFailed: vi.fn(),
    markAsProcessing: vi.fn(),
    markAsReplied: vi.fn(),
    markAsSkipped: vi.fn(),
    patch: vi.fn(),
  };

  const mockCredentialsService = {
    findOne: vi.fn(),
  };

  const mockReplyGenerationService = {
    generateReply: vi.fn(),
  };

  const mockBotActionExecutorService = {
    execute: vi.fn(),
    postReply: vi.fn(),
  };

  const campaignId = new Types.ObjectId();
  const targetId = new Types.ObjectId();
  const credentialId = new Types.ObjectId();
  const orgId = new Types.ObjectId();

  const makeCampaign = (
    overrides: Partial<OutreachCampaignDocument> = {},
  ): OutreachCampaignDocument =>
    ({
      _id: campaignId,
      aiConfig: {
        context: 'some context',
        customInstructions: 'be nice',
        length: ReplyLength.MEDIUM,
        tone: ReplyTone.FRIENDLY,
        useAiGeneration: true,
      } as CampaignAiConfig,
      credential: credentialId,
      organization: orgId,
      platform: CampaignPlatform.TWITTER,
      rateLimits: { delayBetweenRepliesSeconds: 0 },
      status: CampaignStatus.ACTIVE,
      ...overrides,
    }) as unknown as OutreachCampaignDocument;

  const makeTarget = (
    overrides: Partial<CampaignTargetDocument> = {},
  ): CampaignTargetDocument =>
    ({
      _id: targetId,
      authorUsername: 'testuser',
      contentCreatedAt: new Date(),
      contentText: 'hello world',
      externalId: 'tweet123',
      matchedKeyword: 'ai',
      retryCount: 0,
      ...overrides,
    }) as unknown as CampaignTargetDocument;

  const fakeCredential = {
    _id: credentialId,
    accessToken: 'at',
    accessTokenSecret: 'ats',
    externalId: 'ext1',
    refreshToken: 'rt',
    username: 'bot',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignExecutorService,
        { provide: LoggerService, useValue: mockLogger },
        {
          provide: OutreachCampaignsService,
          useValue: mockOutreachCampaignsService,
        },
        {
          provide: CampaignTargetsService,
          useValue: mockCampaignTargetsService,
        },
        { provide: CredentialsService, useValue: mockCredentialsService },
        {
          provide: ReplyGenerationService,
          useValue: mockReplyGenerationService,
        },
        {
          provide: BotActionExecutorService,
          useValue: mockBotActionExecutorService,
        },
      ],
    }).compile();

    service = module.get<CampaignExecutorService>(CampaignExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeTarget', () => {
    it('should skip when campaign is paused', async () => {
      const campaign = makeCampaign({ status: CampaignStatus.PAUSED });
      const target = makeTarget();

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(false);
      expect(result.skipReason).toBe(CampaignSkipReason.CAMPAIGN_PAUSED);
      expect(mockCampaignTargetsService.markAsSkipped).toHaveBeenCalledWith(
        targetId.toString(),
        CampaignSkipReason.CAMPAIGN_PAUSED,
      );
      expect(
        mockOutreachCampaignsService.incrementSkippedCounter,
      ).toHaveBeenCalledWith(campaignId.toString());
    });

    it('should skip when rate limited', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockOutreachCampaignsService.canReply.mockResolvedValue(false);

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(false);
      expect(result.skipReason).toBe(CampaignSkipReason.RATE_LIMITED);
    });

    it('should fail when credential is not found', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(null);

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Credential not found');
      expect(mockCampaignTargetsService.markAsFailed).toHaveBeenCalled();
      expect(
        mockOutreachCampaignsService.incrementFailedCounter,
      ).toHaveBeenCalled();
    });

    it('should execute successfully with AI-generated reply', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockReplyGenerationService.generateReply.mockResolvedValue(
        'Great point!',
      );
      mockBotActionExecutorService.postReply.mockResolvedValue({
        success: true,
        tweetId: 'reply123',
        tweetUrl: 'https://x.com/bot/status/reply123',
      });

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(true);
      expect(result.replyText).toBe('Great point!');
      expect(result.replyExternalId).toBe('reply123');
      expect(mockCampaignTargetsService.markAsProcessing).toHaveBeenCalledWith(
        targetId.toString(),
      );
      expect(mockCampaignTargetsService.markAsReplied).toHaveBeenCalledWith(
        targetId.toString(),
        expect.objectContaining({ replyText: 'Great point!' }),
      );
      expect(
        mockOutreachCampaignsService.incrementReplyCounters,
      ).toHaveBeenCalled();
    });

    it('should use template when AI generation is disabled', async () => {
      const campaign = makeCampaign({
        aiConfig: {
          templateText: 'Hey {{author}}, check this out!',
          useAiGeneration: false,
        } as CampaignAiConfig,
      });
      const target = makeTarget({ authorUsername: 'alice' });
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockBotActionExecutorService.postReply.mockResolvedValue({
        success: true,
        tweetId: 'r1',
        tweetUrl: 'https://x.com/r1',
      });

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(true);
      expect(result.replyText).toBe('Hey alice, check this out!');
      expect(mockReplyGenerationService.generateReply).not.toHaveBeenCalled();
    });

    it('should fail when postReply fails', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockReplyGenerationService.generateReply.mockResolvedValue('reply text');
      mockBotActionExecutorService.postReply.mockResolvedValue({
        error: 'Rate limited by Twitter',
        success: false,
      });

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limited by Twitter');
      expect(mockCampaignTargetsService.markAsFailed).toHaveBeenCalledWith(
        targetId.toString(),
        'Rate limited by Twitter',
        1,
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockOutreachCampaignsService.canReply.mockRejectedValue(
        new Error('DB down'),
      );

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB down');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return error for unsupported platform (reddit)', async () => {
      const campaign = makeCampaign({ platform: CampaignPlatform.REDDIT });
      const target = makeTarget();
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockReplyGenerationService.generateReply.mockResolvedValue('reply');

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Reddit replies not yet implemented');
    });
  });

  describe('previewReply', () => {
    it('should return generated reply without posting', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockReplyGenerationService.generateReply.mockResolvedValue(
        'preview text',
      );

      const preview = await service.previewReply(campaign, target);

      expect(preview).toBe('preview text');
      expect(mockBotActionExecutorService.postReply).not.toHaveBeenCalled();
    });
  });

  describe('processPendingTargets', () => {
    it('should process a batch of pending targets', async () => {
      const campaign = makeCampaign();
      const targets = [makeTarget(), makeTarget({ _id: new Types.ObjectId() })];
      mockCampaignTargetsService.getPendingTargets.mockResolvedValue(targets);
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockReplyGenerationService.generateReply.mockResolvedValue('reply');
      mockBotActionExecutorService.postReply.mockResolvedValue({
        success: true,
        tweetId: 't1',
        tweetUrl: 'url',
      });

      const results = await service.processPendingTargets(campaign, 10);

      expect(results.processed).toBe(2);
      expect(results.successful).toBe(2);
      expect(results.failed).toBe(0);
    });

    it('should count skipped and failed separately', async () => {
      const campaign = makeCampaign();
      const t1 = makeTarget({ _id: new Types.ObjectId() });
      const t2 = makeTarget({ _id: new Types.ObjectId() });
      mockCampaignTargetsService.getPendingTargets.mockResolvedValue([t1, t2]);
      // First target: rate limited
      mockOutreachCampaignsService.canReply
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      mockCredentialsService.findOne.mockResolvedValue(null);

      const results = await service.processPendingTargets(campaign, 10);

      expect(results.skipped).toBe(1);
      expect(results.failed).toBe(1);
    });

    it('should throw if getPendingTargets throws', async () => {
      const campaign = makeCampaign();
      mockCampaignTargetsService.getPendingTargets.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(service.processPendingTargets(campaign)).rejects.toThrow(
        'DB error',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
