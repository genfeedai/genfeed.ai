import type { CampaignTargetDocument } from '@api/collections/campaign-targets/schemas/campaign-target.schema';
import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type {
  CampaignAiConfig,
  OutreachCampaignDocument,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { SystemWorkflowProvenanceService } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import {
  CampaignPlatform,
  CampaignSkipReason,
  CampaignStatus,
  CampaignType,
  ReplyLength,
  ReplyTone,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
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
    reserveReplySlot: vi.fn(),
  };

  const mockCampaignTargetsService = {
    claimForProcessing: vi.fn(),
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

  const mockSystemWorkflowProvenanceService = {
    runAction: vi.fn(
      async (
        _input: unknown,
        action: (provenance: {
          executionId: string;
          workflowId: string;
          workflowLabel: string;
        }) => Promise<unknown>,
      ) => {
        const provenance = {
          executionId: 'execution-1',
          workflowId: 'workflow-1',
          workflowLabel: 'Campaign Reply Automation',
        };
        return { provenance, result: await action(provenance) };
      },
    ),
  };

  const campaignId = 'test-object-id';
  const targetId = 'test-object-id';
  const credentialId = 'test-object-id';
  const orgId = 'test-object-id';
  const brandId = 'brand-1';
  const userId = 'user-1';

  const makeCampaign = (
    overrides: Partial<OutreachCampaignDocument> = {},
  ): OutreachCampaignDocument =>
    ({
      id: campaignId,
      aiConfig: {
        context: 'some context',
        customInstructions: 'be nice',
        length: ReplyLength.MEDIUM,
        tone: ReplyTone.FRIENDLY,
        useAiGeneration: true,
      } as CampaignAiConfig,
      brandId,
      campaignType: CampaignType.MANUAL,
      credentialId,
      organizationId: orgId,
      platform: CampaignPlatform.TWITTER,
      rateLimits: { delayBetweenRepliesSeconds: 0 },
      status: CampaignStatus.ACTIVE,
      userId,
      ...overrides,
    }) as unknown as OutreachCampaignDocument;

  const makeTarget = (
    overrides: Partial<CampaignTargetDocument> = {},
  ): CampaignTargetDocument =>
    ({
      id: targetId,
      authorUsername: 'testuser',
      contentCreatedAt: new Date(),
      contentText: 'hello world',
      externalId: 'tweet123',
      matchedKeyword: 'ai',
      retryCount: 0,
      ...overrides,
    }) as unknown as CampaignTargetDocument;

  const fakeCredential = {
    id: credentialId,
    accessToken: 'at',
    accessTokenSecret: 'ats',
    externalId: 'ext1',
    refreshToken: 'rt',
    username: 'bot',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockOutreachCampaignsService.reserveReplySlot.mockResolvedValue({
      reserved: true,
    });
    mockCampaignTargetsService.claimForProcessing.mockResolvedValue({
      id: targetId,
    });

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
        {
          provide: SystemWorkflowProvenanceService,
          useValue: mockSystemWorkflowProvenanceService,
        },
      ],
    }).compile();

    service = module.get<CampaignExecutorService>(CampaignExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeTarget', () => {
    it('should skip a paused campaign before resolving tenant scope', async () => {
      const campaign = makeCampaign({
        organizationId: undefined,
        status: CampaignStatus.PAUSED,
      } as Partial<OutreachCampaignDocument>);
      const target = makeTarget();

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(false);
      expect(result.skipReason).toBe(CampaignSkipReason.CAMPAIGN_PAUSED);
      expect(mockCampaignTargetsService.markAsSkipped).not.toHaveBeenCalled();
      expect(
        mockOutreachCampaignsService.incrementSkippedCounter,
      ).not.toHaveBeenCalled();
      expect(mockOutreachCampaignsService.canReply).not.toHaveBeenCalled();
      expect(
        mockOutreachCampaignsService.reserveReplySlot,
      ).not.toHaveBeenCalled();
      expect(
        mockCampaignTargetsService.markAsProcessing,
      ).not.toHaveBeenCalled();
    });

    it('should scope authorization and stop before provider effects when replying is rejected', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockOutreachCampaignsService.canReply.mockResolvedValue(false);

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(false);
      expect(result.skipReason).toBe(CampaignSkipReason.RATE_LIMITED);
      expect(mockOutreachCampaignsService.canReply).toHaveBeenCalledWith(
        campaignId,
        orgId,
      );
      expect(
        mockCampaignTargetsService.markAsProcessing,
      ).not.toHaveBeenCalled();
      expect(mockCredentialsService.findOne).not.toHaveBeenCalled();
      expect(mockReplyGenerationService.generateReply).not.toHaveBeenCalled();
      expect(
        mockOutreachCampaignsService.reserveReplySlot,
      ).not.toHaveBeenCalled();
      expect(
        mockSystemWorkflowProvenanceService.runAction,
      ).not.toHaveBeenCalled();
      expect(mockBotActionExecutorService.postReply).not.toHaveBeenCalled();
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
      expect(
        mockOutreachCampaignsService.reserveReplySlot,
      ).not.toHaveBeenCalled();
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
      expect(
        mockCampaignTargetsService.claimForProcessing,
      ).toHaveBeenCalledWith(targetId.toString(), orgId);
      expect(mockCampaignTargetsService.markAsReplied).toHaveBeenCalledWith(
        targetId.toString(),
        orgId,
        expect.objectContaining({ replyText: 'Great point!' }),
      );
      expect(
        mockOutreachCampaignsService.reserveReplySlot,
      ).toHaveBeenCalledWith(campaignId, orgId);
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
        orgId,
        'Rate limited by Twitter',
        1,
      );
      expect(
        mockOutreachCampaignsService.reserveReplySlot,
      ).toHaveBeenCalledWith(campaignId, orgId);
      expect(
        mockOutreachCampaignsService.incrementFailedCounter,
      ).toHaveBeenCalled();
      expect(
        mockOutreachCampaignsService.incrementReplyCounters,
      ).not.toHaveBeenCalled();
    });

    it('honors a denied reservation after advisory preflight and never calls the provider', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockOutreachCampaignsService.reserveReplySlot.mockResolvedValue({
        reserved: false,
      });
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockReplyGenerationService.generateReply.mockResolvedValue(
        'generated reply',
      );

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(false);
      expect(result.skipReason).toBe(CampaignSkipReason.RATE_LIMITED);
      expect(mockReplyGenerationService.generateReply).toHaveBeenCalled();
      expect(
        mockOutreachCampaignsService.reserveReplySlot,
      ).toHaveBeenCalledWith(campaignId, orgId);
      expect(
        mockSystemWorkflowProvenanceService.runAction,
      ).not.toHaveBeenCalled();
      expect(mockBotActionExecutorService.postReply).not.toHaveBeenCalled();
      expect(mockCampaignTargetsService.markAsReplied).not.toHaveBeenCalled();
      expect(
        mockOutreachCampaignsService.incrementReplyCounters,
      ).not.toHaveBeenCalled();
      expect(mockCampaignTargetsService.markAsSkipped).toHaveBeenCalledWith(
        targetId.toString(),
        orgId,
        CampaignSkipReason.RATE_LIMITED,
        expect.anything(),
      );
    });

    it('reserves immediately before the provider after generation', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      const order: string[] = [];
      mockOutreachCampaignsService.canReply.mockImplementation(async () => {
        order.push('canReply');
        return true;
      });
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockReplyGenerationService.generateReply.mockImplementation(async () => {
        order.push('generateReply');
        return 'generated reply';
      });
      mockOutreachCampaignsService.reserveReplySlot.mockImplementation(
        async () => {
          order.push('reserveReplySlot');
          return { reserved: true };
        },
      );
      mockSystemWorkflowProvenanceService.runAction.mockImplementation(
        async (
          _input: unknown,
          action: (provenance: {
            executionId: string;
            workflowId: string;
            workflowLabel: string;
          }) => Promise<unknown>,
        ) => {
          order.push('runAction');
          const provenance = {
            executionId: 'execution-1',
            workflowId: 'workflow-1',
            workflowLabel: 'Campaign Reply Automation',
          };
          return { provenance, result: await action(provenance) };
        },
      );
      mockBotActionExecutorService.postReply.mockResolvedValue({
        success: true,
        tweetId: 'reply123',
        tweetUrl: 'https://x.com/bot/status/reply123',
      });

      await service.executeTarget(campaign, target);

      expect(order).toEqual([
        'canReply',
        'generateReply',
        'reserveReplySlot',
        'runAction',
      ]);
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

    it('should scope the credential lookup with scalar brand and organization ids', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockReplyGenerationService.generateReply.mockResolvedValue('reply');
      mockBotActionExecutorService.postReply.mockResolvedValue({
        success: true,
        tweetId: 't1',
        tweetUrl: 'url',
      });

      await service.executeTarget(campaign, target);

      expect(mockCredentialsService.findOne).toHaveBeenCalledWith({
        id: credentialId,
        brandId,
        isDeleted: false,
        organizationId: orgId,
      });
    });

    it('should omit the brand filter when the campaign has no brand', async () => {
      const campaign = makeCampaign({ brandId: undefined });
      const target = makeTarget();
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockReplyGenerationService.generateReply.mockResolvedValue('reply');
      mockBotActionExecutorService.postReply.mockResolvedValue({
        success: true,
        tweetId: 't1',
        tweetUrl: 'url',
      });

      await service.executeTarget(campaign, target);

      expect(mockCredentialsService.findOne).toHaveBeenCalledWith({
        id: credentialId,
        isDeleted: false,
        organizationId: orgId,
      });
    });

    it('should not query credentials at all when the campaign has no credential', async () => {
      const campaign = makeCampaign({ credentialId: undefined });
      const target = makeTarget();
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Credential not found');
      expect(mockCredentialsService.findOne).not.toHaveBeenCalled();
      expect(
        mockOutreachCampaignsService.reserveReplySlot,
      ).not.toHaveBeenCalled();
    });

    it('should fail closed without querying credentials when the organization cannot be resolved', async () => {
      const campaign = makeCampaign({
        organizationId: undefined,
      } as Partial<OutreachCampaignDocument>);
      const target = makeTarget();
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(false);
      expect(mockCredentialsService.findOne).not.toHaveBeenCalled();
      expect(mockOutreachCampaignsService.canReply).not.toHaveBeenCalled();
      expect(
        mockOutreachCampaignsService.reserveReplySlot,
      ).not.toHaveBeenCalled();
      expect(
        mockCampaignTargetsService.markAsProcessing,
      ).not.toHaveBeenCalled();
      expect(mockReplyGenerationService.generateReply).not.toHaveBeenCalled();
      expect(
        mockSystemWorkflowProvenanceService.runAction,
      ).not.toHaveBeenCalled();
      expect(mockBotActionExecutorService.postReply).not.toHaveBeenCalled();
      expect(mockCampaignTargetsService.markAsFailed).not.toHaveBeenCalled();
    });

    it('should return error for unsupported platform (reddit)', async () => {
      const campaign = makeCampaign({ platform: CampaignPlatform.REDDIT });
      const target = makeTarget();
      mockOutreachCampaignsService.canReply.mockResolvedValue(true);
      mockCredentialsService.findOne.mockResolvedValue(fakeCredential);
      mockReplyGenerationService.generateReply.mockResolvedValue('reply');

      const result = await service.executeTarget(campaign, target);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'This outreach platform and campaign type combination is not available.',
      );
      expect(mockOutreachCampaignsService.canReply).not.toHaveBeenCalled();
      expect(
        mockCampaignTargetsService.claimForProcessing,
      ).not.toHaveBeenCalled();
      expect(mockCredentialsService.findOne).not.toHaveBeenCalled();
      expect(mockReplyGenerationService.generateReply).not.toHaveBeenCalled();
      expect(
        mockSystemWorkflowProvenanceService.runAction,
      ).not.toHaveBeenCalled();
      expect(mockBotActionExecutorService.postReply).not.toHaveBeenCalled();
      expect(mockCampaignTargetsService.markAsSkipped).not.toHaveBeenCalled();
      expect(mockCampaignTargetsService.markAsFailed).not.toHaveBeenCalled();
    });
  });

  describe('previewReply', () => {
    it('rejects an unavailable pair before generation', async () => {
      const campaign = makeCampaign({
        platform: CampaignPlatform.INSTAGRAM,
      });
      const target = makeTarget();

      await expect(
        service.previewReply(campaign, target),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockReplyGenerationService.generateReply).not.toHaveBeenCalled();
    });

    it('should return generated reply without posting', async () => {
      const campaign = makeCampaign();
      const target = makeTarget();
      mockReplyGenerationService.generateReply.mockResolvedValue(
        'preview text',
      );

      const preview = await service.previewReply(campaign, target);

      expect(preview).toBe('preview text');
      expect(mockBotActionExecutorService.postReply).not.toHaveBeenCalled();
      // Preview resolves ownership from the scalar FKs like the execute path does,
      // so the generation is billed to the campaign's real org/user.
      expect(mockReplyGenerationService.generateReply).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: orgId, userId }),
      );
    });
  });

  describe('processPendingTargets', () => {
    it('skips an unavailable pair before reading targets', async () => {
      const campaign = makeCampaign({ platform: CampaignPlatform.INSTAGRAM });

      const results = await service.processPendingTargets(campaign, 10);

      expect(results).toEqual({
        failed: 0,
        processed: 0,
        skipped: 0,
        successful: 0,
      });
      expect(
        mockCampaignTargetsService.getPendingTargets,
      ).not.toHaveBeenCalled();
    });

    it('should process a batch of pending targets', async () => {
      const campaign = makeCampaign();
      const targets = [makeTarget(), makeTarget({ id: 'test-object-id' })];
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

      expect(mockCampaignTargetsService.getPendingTargets).toHaveBeenCalledWith(
        campaignId,
        orgId,
        10,
        { scheduleVersion: 1 },
      );
      expect(results.processed).toBe(2);
      expect(results.successful).toBe(2);
      expect(results.failed).toBe(0);
    });

    it('should count skipped and failed separately', async () => {
      const campaign = makeCampaign();
      const t1 = makeTarget({ id: 'test-object-id' });
      const t2 = makeTarget({ id: 'test-object-id' });
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
