import { ReplyPollingWorkflowService } from '@api/collections/workflows/services/reply-polling-workflow.service';
import { ReplyBotPlatform } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ReplyPollingWorkflowService', () => {
  const replyBotConfigsService = { find: vi.fn() };
  const credentialsService = { findOne: vi.fn() };
  const replyBotOrchestratorService = { processOrganizationBots: vi.fn() };
  const prisma = {
    workflow: { findMany: vi.fn(), update: vi.fn() },
  };
  const executionQueue = { queueTriggerEvent: vi.fn() };
  const twitterAdapter = {
    createEngagementChecker: vi.fn(),
    createFollowerChecker: vi.fn(),
    createKeywordChecker: vi.fn(),
    createLikeChecker: vi.fn(),
    createMentionChecker: vi.fn(),
    createRepostChecker: vi.fn(),
  };
  const instagramAdapter = {
    createFollowerChecker: vi.fn(),
    createLikeChecker: vi.fn(),
    createMentionChecker: vi.fn(),
    createRepostChecker: vi.fn(),
  };
  const configService = { isDevSchedulersEnabled: true };
  const cacheService = { acquireLock: vi.fn(), releaseLock: vi.fn() };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: ReplyPollingWorkflowService;

  beforeEach(() => {
    vi.clearAllMocks();
    configService.isDevSchedulersEnabled = true;
    replyBotConfigsService.find.mockResolvedValue([]);
    credentialsService.findOne.mockResolvedValue(null);
    replyBotOrchestratorService.processOrganizationBots.mockResolvedValue([]);
    prisma.workflow.findMany.mockResolvedValue([]);
    prisma.workflow.update.mockResolvedValue({});
    executionQueue.queueTriggerEvent.mockResolvedValue('job-1');
    cacheService.acquireLock.mockResolvedValue(true);
    cacheService.releaseLock.mockResolvedValue(undefined);
    twitterAdapter.createMentionChecker.mockReturnValue(
      vi.fn().mockResolvedValue(null),
    );

    service = new ReplyPollingWorkflowService(
      replyBotConfigsService as never,
      credentialsService as never,
      replyBotOrchestratorService as never,
      prisma as never,
      executionQueue as never,
      twitterAdapter as never,
      instagramAdapter as never,
      configService as never,
      cacheService as never,
      logger as never,
    );
  });

  it('skips reply bot polling when the per-org lock is held', async () => {
    cacheService.acquireLock.mockResolvedValue(false);

    const result = await service.runReplyBotPolling('org-1');

    expect(replyBotConfigsService.find).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'replyBotPolling',
      organizationId: 'org-1',
      reason: 'reply_bot_polling_locked',
      status: 'skipped',
    });
  });

  it('discovers active reply bot credentials inside the workflow organization', async () => {
    replyBotConfigsService.find.mockResolvedValue([
      {
        _id: 'config-1',
        config: { credential: 'credential-1' },
        isActive: true,
        organization: 'org-1',
      },
    ]);
    credentialsService.findOne.mockResolvedValue({
      accessToken: 'token',
      accessTokenSecret: 'secret',
      externalId: 'external-1',
      platform: ReplyBotPlatform.TWITTER,
      refreshToken: 'refresh',
      username: 'brand',
    });
    replyBotOrchestratorService.processOrganizationBots.mockResolvedValue([
      {
        botConfigId: 'config-1',
        contentProcessed: 2,
        dmsSent: 0,
        errors: 0,
        platform: ReplyBotPlatform.TWITTER,
        repliesSent: 1,
        skipped: 1,
      },
    ]);

    const result = await service.runReplyBotPolling('org-1');

    expect(replyBotConfigsService.find).toHaveBeenCalledWith({
      isActive: true,
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(credentialsService.findOne).toHaveBeenCalledWith({
      _id: 'credential-1',
      isDeleted: false,
      organization: 'org-1',
    });
    expect(
      replyBotOrchestratorService.processOrganizationBots,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        platform: ReplyBotPlatform.TWITTER,
        username: 'brand',
      }),
    );
    expect(result).toMatchObject({
      action: 'replyBotPolling',
      checked: 1,
      errors: 0,
      organizationId: 'org-1',
      status: 'completed',
      triggered: 1,
    });
  });

  it('skips social trigger polling when local schedulers are disabled', async () => {
    configService.isDevSchedulersEnabled = false;

    const result = await service.runSocialTriggerPolling('org-1');

    expect(prisma.workflow.findMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'socialTriggerPolling',
      reason: 'local_schedulers_disabled',
      status: 'skipped',
    });
  });

  it('polls social trigger workflows by organization and queues trigger events', async () => {
    prisma.workflow.findMany.mockResolvedValue([
      {
        config: {},
        id: 'workflow-1',
        nodes: [
          {
            data: { config: { platform: 'twitter' } },
            id: 'mention-1',
            type: 'mentionTrigger',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      },
    ]);
    twitterAdapter.createMentionChecker.mockReturnValue(
      vi.fn().mockResolvedValue({
        authorUsername: 'customer',
        postId: 'tweet-1',
        text: 'hello',
      }),
    );

    const result = await service.runSocialTriggerPolling('org-1');

    expect(prisma.workflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(executionQueue.queueTriggerEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({ postId: 'tweet-1' }),
      organizationId: 'org-1',
      platform: 'twitter',
      type: 'mentionTrigger',
      userId: 'user-1',
    });
    expect(prisma.workflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({
            metadata: expect.objectContaining({
              pollState: expect.objectContaining({
                'mention-1': 'tweet-1',
              }),
            }),
          }),
        }),
        where: { id: 'workflow-1' },
      }),
    );
    expect(result).toMatchObject({
      action: 'socialTriggerPolling',
      checked: 1,
      organizationId: 'org-1',
      status: 'completed',
      triggered: 1,
    });
  });
});
