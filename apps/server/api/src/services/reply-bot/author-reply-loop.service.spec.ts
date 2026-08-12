import { AuthorReplyLoopService } from '@api/services/reply-bot/author-reply-loop.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AuthorReplyLoopService', () => {
  const prisma = {
    contentPerformance: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    credential: { findFirst: vi.fn() },
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
  const botActionExecutorService = {
    postReply: vi.fn().mockResolvedValue({
      contentId: 'reply-1',
      contentUrl: 'https://x.com/i/status/reply-1',
      success: true,
    }),
  };
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
    service = new AuthorReplyLoopService(
      prisma as never,
      logger as never,
      socialMonitorService as never,
      replyGenerationService as never,
      botActionExecutorService as never,
      replyBotConfigsService as never,
      credentialsService as never,
      processedTweetsService as never,
      xActivitySubscriptionService as never,
    );
  });

  it('creates a comment_responder config when none exists', async () => {
    replyBotConfigsService.find.mockResolvedValue([]);
    prisma.credential.findFirst.mockResolvedValue({ id: 'cred-1' });
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
    botActionExecutorService.postReply.mockResolvedValue({
      contentId: 'yt-reply-1',
      success: true,
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

    expect(botActionExecutorService.postReply).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: 'youtube',
      }),
      expect.objectContaining({ id: 'c1' }),
      'Thanks for watching!',
    );
    expect(result.success).toBe(true);
    expect(result.contentId).toBe('yt-reply-1');
  });

  it('rejects YouTube send without a YouTube credential', async () => {
    replyBotConfigsService.find.mockResolvedValue([]);
    prisma.credential.findFirst.mockResolvedValue(null);

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
});
