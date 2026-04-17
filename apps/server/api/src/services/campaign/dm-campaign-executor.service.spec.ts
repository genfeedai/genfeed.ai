import type { CampaignTargetDocument } from '@api/collections/campaign-targets/schemas/campaign-target.schema';
import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type {
  CampaignDmConfig,
  OutreachCampaignDocument,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { DmCampaignExecutorService } from '@api/services/campaign/dm-campaign-executor.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import {
  CampaignPlatform,
  CampaignSkipReason,
  CampaignStatus,
  CampaignTargetStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DmCampaignExecutorService', () => {
  let service: DmCampaignExecutorService;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockOutreachCampaignsService = {
    canReply: vi.fn(),
    incrementDmCounter: vi.fn(),
    incrementFailedCounter: vi.fn(),
    incrementSkippedCounter: vi.fn(),
  };

  const mockCampaignTargetsService = {
    getPendingTargets: vi.fn(),
    markAsFailed: vi.fn(),
    markAsProcessing: vi.fn(),
    markAsSkipped: vi.fn(),
    updateOne: vi.fn(),
  };

  const mockCredentialsService = {
    findOne: vi.fn(),
  };

  const mockReplyGenerationService = {
    generateDm: vi.fn(),
  };

  const mockBotActionExecutorService = {
    resolveTwitterUserId: vi.fn(),
    sendDm: vi.fn(),
  };

  const campaignId = new Types.ObjectId();
  const targetId = new Types.ObjectId();
  const credentialId = new Types.ObjectId();
  const orgId = new Types.ObjectId();

  const fakeCredential = {
    _id: credentialId,
    accessToken: 'at',
    accessTokenSecret: 'ats',
    externalId: 'ext1',
    platform: 'twitter',
    refreshToken: 'rt',
    username: 'bot',
  };

  const makeCampaign = (
    overrides: Partial<OutreachCampaignDocument> = {},
  ): OutreachCampaignDocument =>
    ({
      _id: campaignId,
      credential: credentialId,
      dmConfig: {
        context: 'outreach',
        ctaLink: 'https://example.com',
        customInstructions: 'be polite',
        offer: 'free trial',
        useAiGeneration: true,
      } as CampaignDmConfig,
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
      recipientUserId: 'uid123',
      recipientUsername: 'targetuser',
      retryCount: 0,
      ...overrides,
    }) as unknown as CampaignTargetDocument;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmCampaignExecutorService,
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

    service = module.get<DmCampaignExecutorService>(DmCampaignExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processPendingDmTargets', () => {
    it('should skip targets when campaign is paused', async () => {
      const campaign = makeCampaign({ status: CampaignStatus.PAUSED });
      const target = makeTarget();
      mockCampaignTargetsService.getPendingTargets.mockResolvedValue([target]);

      const result = await service.processPendingDmTargets(campaign, 10);

      expect(result.skipped).toBe(1);
      expect(result.successful).toBe(0);
      expect(mockCampaignTargetsService.markAsSkipped).toHaveBeenCalledWith(
        targetId.toString(),
        CampaignSkipReason.CAMPAIGN_PAUSED,
      );
    });

    it('should skip targets when rate limited', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockCampaignTargetsService.getPendingTargets.mockResolvedValue([target]);
      mockOutreachCampaignsService.canReply.mockResolvedValue(false);

      const result = await service.processPendingDmTargets(campaign, 10);

      expect(result.skipped).toBe(1);
      expect(mockCampaignTargetsService.markAsSkipped).toHaveBeenCalledWith(
        targetId.toString(),
        CampaignSkipReason.RATE_LIMITED,
      );
    });

    it('should fail when credential is not found', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockCampaignTargetsService.getPendingTargets.mockResolvedValue([target]);
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(null);

      const result = await service.processPendingDmTargets(campaign, 10);

      expect(result.failed).toBe(1);
      expect(mockCampaignTargetsService.markAsFailed).toHaveBeenCalledWith(
        targetId.toString(),
        'Credential not found',
      );
    });

    it('should resolve username to userId when recipientUserId is missing', async () => {
      const campaign = makeCampaign();
      const target = makeTarget({ recipientUserId: undefined });
      mockCampaignTargetsService.getPendingTargets.mockResolvedValue([target]);
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockBotActionExecutorService.resolveTwitterUserId.mockResolvedValue(
        'resolved-uid',
      );
      mockReplyGenerationService.generateDm.mockResolvedValue('Hey there!');
      mockBotActionExecutorService.sendDm.mockResolvedValue({ success: true });

      const result = await service.processPendingDmTargets(campaign, 10);

      expect(result.successful).toBe(1);
      expect(
        mockBotActionExecutorService.resolveTwitterUserId,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'at' }),
        'targetuser',
      );
      expect(mockCampaignTargetsService.updateOne).toHaveBeenCalledWith(
        targetId.toString(),
        expect.objectContaining({ recipientUserId: 'resolved-uid' }),
      );
    });

    it('should skip when user cannot be resolved', async () => {
      const campaign = makeCampaign();
      const target = makeTarget({ recipientUserId: undefined });
      mockCampaignTargetsService.getPendingTargets.mockResolvedValue([target]);
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockBotActionExecutorService.resolveTwitterUserId.mockResolvedValue(null);

      const result = await service.processPendingDmTargets(campaign, 10);

      expect(result.skipped).toBe(1);
      expect(mockCampaignTargetsService.markAsSkipped).toHaveBeenCalledWith(
        targetId.toString(),
        CampaignSkipReason.USER_NOT_FOUND,
      );
    });

    it('should fail when no recipientUsername and no recipientUserId', async () => {
      const campaign = makeCampaign();
      const target = makeTarget({
        recipientUserId: undefined,
        recipientUsername: undefined,
      });
      mockCampaignTargetsService.getPendingTargets.mockResolvedValue([target]);
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);

      const result = await service.processPendingDmTargets(campaign, 10);

      expect(result.failed).toBe(1);
      expect(mockCampaignTargetsService.markAsFailed).toHaveBeenCalledWith(
        targetId.toString(),
        'No recipient username or userId',
      );
    });

    it('should send DM successfully using AI-generated text', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockCampaignTargetsService.getPendingTargets.mockResolvedValue([target]);
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockReplyGenerationService.generateDm.mockResolvedValue(
        'Hi targetuser, check this out!',
      );
      mockBotActionExecutorService.sendDm.mockResolvedValue({ success: true });

      const result = await service.processPendingDmTargets(campaign, 10);

      expect(result.successful).toBe(1);
      expect(result.processed).toBe(1);
      expect(mockCampaignTargetsService.updateOne).toHaveBeenCalledWith(
        targetId.toString(),
        expect.objectContaining({
          dmText: 'Hi targetuser, check this out!',
          status: CampaignTargetStatus.SENT,
        }),
      );
      expect(
        mockOutreachCampaignsService.incrementDmCounter,
      ).toHaveBeenCalledWith(campaignId.toString());
    });

    it('should use template when AI generation is disabled', async () => {
      const campaign = makeCampaign({
        dmConfig: {
          ctaLink: 'https://link.com',
          offer: '50% off',
          templateText: 'Hey {{username}}, grab {{offer}} at {{cta}}',
          useAiGeneration: false,
        } as CampaignDmConfig,
      });
      const target = makeTarget();
      mockCampaignTargetsService.getPendingTargets.mockResolvedValue([target]);
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockBotActionExecutorService.sendDm.mockResolvedValue({ success: true });

      const result = await service.processPendingDmTargets(campaign, 10);

      expect(result.successful).toBe(1);
      expect(mockReplyGenerationService.generateDm).not.toHaveBeenCalled();
      expect(mockCampaignTargetsService.updateOne).toHaveBeenCalledWith(
        targetId.toString(),
        expect.objectContaining({
          dmText: 'Hey targetuser, grab 50% off at https://link.com',
        }),
      );
    });

    it('should skip when DM is not allowed', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockCampaignTargetsService.getPendingTargets.mockResolvedValue([target]);
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockReplyGenerationService.generateDm.mockResolvedValue('Hello!');
      mockBotActionExecutorService.sendDm.mockResolvedValue({
        error: 'You cannot send messages to this user',
        success: false,
      });

      const result = await service.processPendingDmTargets(campaign, 10);

      expect(result.skipped).toBe(1);
      expect(mockCampaignTargetsService.markAsSkipped).toHaveBeenCalledWith(
        targetId.toString(),
        CampaignSkipReason.DM_NOT_ALLOWED,
      );
    });

    it('should fail when sendDm returns generic error', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockCampaignTargetsService.getPendingTargets.mockResolvedValue([target]);
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockReplyGenerationService.generateDm.mockResolvedValue('Hello!');
      mockBotActionExecutorService.sendDm.mockResolvedValue({
        error: 'Internal server error',
        success: false,
      });

      const result = await service.processPendingDmTargets(campaign, 10);

      expect(result.failed).toBe(1);
      expect(mockCampaignTargetsService.markAsFailed).toHaveBeenCalledWith(
        targetId.toString(),
        'Internal server error',
        1,
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      const campaign = makeCampaign();
      mockCampaignTargetsService.getPendingTargets.mockRejectedValue(
        new Error('Connection lost'),
      );

      await expect(service.processPendingDmTargets(campaign)).rejects.toThrow(
        'Connection lost',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should process multiple targets and track counts', async () => {
      const campaign = makeCampaign();
      const t1 = makeTarget({ _id: new Types.ObjectId() });
      const t2 = makeTarget({ _id: new Types.ObjectId() });
      const t3 = makeTarget({ _id: new Types.ObjectId() });
      mockCampaignTargetsService.getPendingTargets.mockResolvedValue([
        t1,
        t2,
        t3,
      ]);
      mockOutreachCampaignsService.canReply
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockReplyGenerationService.generateDm.mockResolvedValue('Hey!');
      mockBotActionExecutorService.sendDm
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ error: 'fail', success: false });

      const result = await service.processPendingDmTargets(campaign, 10);

      expect(result.processed).toBe(3);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });
});
