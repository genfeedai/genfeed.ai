import { AuthorReplyLoopService } from '@api/services/reply-bot/author-reply-loop.service';
import {
  buildAuthorReplyDraftWorkflowDefinition,
  buildAuthorReplySendWorkflowDefinition,
} from '@api/services/reply-bot/author-reply-workflow-definition';
import { createSystemWorkflowRunnerMock } from '@api/shared/testing/system-workflow-runner-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AuthorReplyLoopService', () => {
  const prisma = {
    contentPerformance: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    credential: { findMany: vi.fn() },
    processedTweet: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const logger = { log: vi.fn(), warn: vi.fn() };
  const socialMonitorService = {
    getContentComments: vi.fn(),
    getUserTimeline: vi.fn(),
  };
  const replyGenerationService = {
    generateReply: vi.fn().mockResolvedValue('Solid take — here is why.'),
  };
  const systemWorkflowRunner = createSystemWorkflowRunnerMock({
    definitions: [
      buildAuthorReplyDraftWorkflowDefinition(),
      buildAuthorReplySendWorkflowDefinition(),
    ],
  });
  const executeWorkflowDefinition =
    systemWorkflowRunner.runWorkflow.getMockImplementation();
  const replyBotConfigsService = {
    create: vi.fn(),
    find: vi.fn(),
    patch: vi.fn(),
  };
  const credentialsService = {
    findOne: vi.fn(),
  };
  const processedTweetsService = {
    markAsProcessed: vi.fn(),
  };
  const xActivitySubscriptionService = {
    ensureSubscriptionForUser: vi.fn().mockResolvedValue({
      message: 'X_ACTIVITY_WEBHOOK_ENABLED is off — subscription skipped',
      mode: 'skipped',
    }),
  };

  let service: AuthorReplyLoopService;

  beforeEach(() => {
    vi.clearAllMocks();
    if (executeWorkflowDefinition) {
      systemWorkflowRunner.runWorkflow.mockImplementation(
        executeWorkflowDefinition,
      );
    }
    service = new AuthorReplyLoopService(
      prisma as never,
      logger as never,
      socialMonitorService as never,
      replyGenerationService as never,
      systemWorkflowRunner as never,
      replyBotConfigsService as never,
      credentialsService as never,
      processedTweetsService as never,
      xActivitySubscriptionService as never,
    );
    service.onModuleInit();
  });

  it('creates a comment_responder config when none exists', async () => {
    replyBotConfigsService.find.mockResolvedValue([]);
    prisma.credential.findMany.mockResolvedValue([{ id: 'cred-1' }]);
    replyBotConfigsService.create.mockResolvedValue({
      id: 'bot-1',
      isActive: true,
    });

    const result = await service.ensureAuthorResponder({
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(replyBotConfigsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        credentialId: 'cred-1',
        filters: expect.objectContaining({ maxAgeHours: 24 }),
        isActive: true,
        type: 'comment_responder',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        botConfigId: 'bot-1',
        created: true,
        isActive: true,
        maxAgeHours: 24,
        platform: 'twitter',
        xActivity: expect.objectContaining({ mode: 'skipped' }),
      }),
    );
  });

  it('lists unreplied comments on brand posts', async () => {
    replyBotConfigsService.find.mockResolvedValue([
      {
        brandId: 'brand-1',
        config: { credentialId: 'cred-1' },
        id: 'bot-1',
        platform: 'twitter',
        type: 'comment_responder',
      },
    ]);
    credentialsService.findOne.mockResolvedValue({
      accessToken: 'enc',
      id: 'cred-1',
      username: 'brandx',
    });
    socialMonitorService.getUserTimeline.mockResolvedValue([
      {
        contentUrl: 'https://x.com/brandx/status/p1',
        createdAt: new Date(),
        id: 'p1',
        text: 'Parent post',
      },
    ]);
    socialMonitorService.getContentComments.mockResolvedValue([
      {
        authorId: 'u2',
        authorUsername: 'reader',
        contentUrl: 'https://x.com/reader/status/c1',
        createdAt: new Date(),
        id: 'c1',
        text: 'Great point',
      },
    ]);

    // EncryptionUtil will try to decrypt — mock credential with empty token handling
    // by stubbing username path only; decrypt may throw on bad token.
    // Use findTwitterCredential path: set accessToken that decrypt can handle
    // For unit test, spy by loading credential that returns already-shaped data:
    // AuthorReplyLoop decrypts — we need EncryptionUtil. Use empty and mock differently.

    // Simpler: mock load via findOne with tokens that EncryptionUtil can process
    // EncryptionUtil.decrypt('') may return ''
    credentialsService.findOne.mockResolvedValue({
      accessToken: '',
      username: 'brandx',
    });

    const inbox = await service.getInbox({
      brandId: 'brand-1',
      organizationId: 'org-1',
    });

    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).toMatchObject({
      commentId: 'c1',
      intent: 'thanks',
      parentPostId: 'p1',
    });
  });

  it('records author closed loops on content performance', async () => {
    prisma.contentPerformance.findFirst.mockResolvedValue({
      data: { authorClosedLoops: 1 },
      id: 'perf-1',
    });
    prisma.contentPerformance.update.mockResolvedValue({});

    await service.recordAuthorClosedLoop({
      brandId: 'brand-1',
      commentId: 'c1',
      organizationId: 'org-1',
      parentPostId: 'p1',
      replyContentId: 'r1',
    });

    expect(prisma.contentPerformance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({
            authorClosedLoops: 2,
            lastAuthorReplyCommentId: 'c1',
          }),
        }),
        where: {
          id: 'perf-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
  });

  it('drafts with youtube platform pack', async () => {
    const result = await service.draftReply({
      brandId: 'brand-1',
      commentAuthor: 'viewer',
      commentId: 'c1',
      commentText: 'Great video!',
      organizationId: 'org-1',
      platform: 'youtube',
      userId: 'user-1',
    });

    expect(replyGenerationService.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'youtube',
      }),
    );
    expect(result.draft).toContain('Solid take');
    expect(result.harnessApplied).toBe(true);
  });

  it('sends X replies via OAuth2 brand credential and executor', async () => {
    replyBotConfigsService.find.mockResolvedValue([
      {
        brandId: 'brand-1',
        config: { credentialId: 'x-cred' },
        id: 'bot-x',
        platform: 'twitter',
        type: 'comment_responder',
      },
    ]);
    credentialsService.findOne.mockResolvedValue({
      accessToken: '',
      id: 'x-cred',
      username: 'brandx',
    });
    // `sendReply` returns the workflow result verbatim, so the stub carries the
    // public `AuthorReplySendResult` contract, not the internal send state.
    systemWorkflowRunner.runWorkflow.mockResolvedValue({
      provenance: {
        executionId: 'execution-1',
        workflowId: 'workflow-1',
        workflowLabel: 'Author Reply Loop',
      },
      result: {
        commentId: 'c1',
        contentId: 'x-reply-1',
        contentUrl: 'https://x.com/brandx/status/x-reply-1',
        replyText: 'Thanks!',
        success: true,
      },
    });

    const result = await service.sendReply({
      brandId: 'brand-1',
      commentAuthor: 'reader',
      commentAuthorId: 'u2',
      commentId: 'c1',
      commentText: 'Great point',
      organizationId: 'org-1',
      parentPostId: 'p1',
      replyText: 'Thanks!',
      userId: 'user-1',
    });

    expect(systemWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'author-reply.send-reply',
        inputValues: {
          request: expect.objectContaining({
            replyText: 'Thanks!',
          }),
        },
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    expect(result.success).toBe(true);
    expect(result.contentId).toBe('x-reply-1');
  });

  it('sends YouTube replies via YouTube credential and executor', async () => {
    replyBotConfigsService.find.mockResolvedValue([
      {
        brandId: 'brand-1',
        config: { credentialId: 'yt-cred' },
        id: 'bot-yt',
        platform: 'youtube',
        type: 'comment_responder',
      },
    ]);
    credentialsService.findOne.mockResolvedValue({
      accessToken: '',
      id: 'yt-cred',
      username: 'channel',
    });
    systemWorkflowRunner.runWorkflow.mockResolvedValue({
      provenance: {
        executionId: 'execution-1',
        workflowId: 'workflow-1',
        workflowLabel: 'Author Reply Loop',
      },
      result: {
        commentId: 'c1',
        contentId: 'yt-reply-1',
        replyText: 'Thanks for watching!',
        success: true,
      },
    });

    const result = await service.sendReply({
      brandId: 'brand-1',
      commentAuthor: 'viewer',
      commentAuthorId: 'ch-2',
      commentId: 'c1',
      commentText: 'Great video!',
      organizationId: 'org-1',
      parentPostId: 'video-1',
      platform: 'youtube',
      replyText: 'Thanks for watching!',
      userId: 'user-1',
    });

    expect(systemWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'author-reply.send-reply',
        inputValues: {
          request: expect.objectContaining({
            replyText: 'Thanks for watching!',
          }),
        },
      }),
    );
    expect(result.success).toBe(true);
    expect(result.contentId).toBe('yt-reply-1');
  });

  it('rejects YouTube send without a YouTube credential', async () => {
    replyBotConfigsService.find.mockResolvedValue([]);
    prisma.credential.findMany.mockResolvedValue([]);

    await expect(
      service.sendReply({
        brandId: 'brand-1',
        commentAuthor: 'viewer',
        commentId: 'c1',
        commentText: 'Great video!',
        organizationId: 'org-1',
        parentPostId: 'video-1',
        platform: 'youtube',
        replyText: 'Thanks!',
        userId: 'user-1',
      }),
    ).rejects.toThrow(/YouTube credential/i);
  });

  it('refuses to guess an account when the brand holds several on the platform', async () => {
    replyBotConfigsService.find.mockResolvedValue([]);
    // Two live X accounts and nothing in the config saying which one speaks:
    // replying as the wrong brand account is worse than not replying.
    prisma.credential.findMany.mockResolvedValue([
      { id: 'cred-1' },
      { id: 'cred-2' },
    ]);

    await expect(
      service.ensureAuthorResponder({
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(/X\/Twitter credential/i);

    expect(replyBotConfigsService.create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('refusing to guess'),
      expect.objectContaining({ brandId: 'brand-1', organizationId: 'org-1' }),
    );
  });

  it('keeps credential material out of the send workflow input', async () => {
    replyBotConfigsService.find.mockResolvedValue([
      {
        brandId: 'brand-1',
        config: { credentialId: 'x-cred-2' },
        id: 'bot-1',
        platform: 'twitter',
        type: 'comment_responder',
      },
    ]);
    credentialsService.findOne.mockResolvedValue({
      accessToken: '',
      id: 'x-cred-2',
      platform: 'twitter',
      username: 'brandx_labs',
    });
    systemWorkflowRunner.runWorkflow.mockResolvedValue({
      provenance: {
        executionId: 'execution-1',
        workflowId: 'workflow-1',
        workflowLabel: 'Author Reply Loop',
      },
      result: {
        replyContentId: 'x-reply-2',
        replyContentUrl: 'https://x.com/brandx_labs/status/x-reply-2',
        replySent: true,
      },
    });

    await service.sendReply({
      brandId: 'brand-1',
      commentAuthor: 'viewer',
      commentId: 'c1',
      commentText: 'Nice one',
      organizationId: 'org-1',
      parentPostId: 'p1',
      platform: 'twitter',
      replyText: 'Thanks!',
      userId: 'user-1',
    });

    expect(systemWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'author-reply.send-reply',
        inputValues: {
          request: expect.not.objectContaining({
            accessToken: expect.anything(),
          }),
        },
      }),
    );
    expect(prisma.credential.findMany).not.toHaveBeenCalled();
  });

  describe('findResponderOwnerUserId', () => {
    it('returns the scalar userId FK', async () => {
      replyBotConfigsService.find.mockResolvedValue([
        {
          platform: 'twitter',
          type: 'comment_responder',
          userId: 'user-1',
        },
      ]);

      await expect(
        service.findResponderOwnerUserId('org-1', 'brand-1'),
      ).resolves.toBe('user-1');
    });

    it('does not fall back to the Document user alias', async () => {
      replyBotConfigsService.find.mockResolvedValue([
        {
          platform: 'twitter',
          type: 'comment_responder',
          user: 'user-1',
        },
      ]);

      await expect(
        service.findResponderOwnerUserId('org-1', 'brand-1'),
      ).resolves.toBeUndefined();
    });
  });
});
