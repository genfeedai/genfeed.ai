import { AuthorReplyLoopService } from '@api/services/reply-bot/author-reply-loop.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AuthorReplyLoopService.getInbox YouTube path', () => {
  const prisma = {
    credential: { findMany: vi.fn() },
    processedTweet: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const logger = { warn: vi.fn(), log: vi.fn(), error: vi.fn() };
  const socialMonitorService = {
    getUserTimeline: vi.fn(),
    getContentComments: vi.fn(),
  };
  const replyGenerationService = {};
  const systemWorkflowRunner = {};
  const replyBotConfigsService = {
    find: vi.fn().mockResolvedValue([]),
    patch: vi.fn(),
  };
  const credentialsService = {
    findOne: vi.fn(),
  };
  const processedTweetsService = {};
  const xActivitySubscriptionService = {};

  let service: AuthorReplyLoopService;

  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it('lists YouTube comments when platform=youtube and credential exists', async () => {
    prisma.credential.findMany.mockResolvedValue([{ id: 'yt-cred' }]);
    // Empty accessToken decrypts safely (same as author-reply-loop.service.spec).
    credentialsService.findOne.mockResolvedValue({
      accessToken: '',
      externalId: 'UCabcdefghijklmnopqrstuv',
      id: 'yt-cred',
      username: 'brandchannel',
    });

    socialMonitorService.getUserTimeline.mockResolvedValue([
      {
        contentUrl: 'https://youtube.com/watch?v=vid1',
        createdAt: new Date(),
        id: 'vid1',
        text: 'My upload',
      },
    ]);
    socialMonitorService.getContentComments.mockResolvedValue([
      {
        authorDisplayName: 'Viewer',
        authorId: 'u1',
        authorUsername: 'viewer1',
        contentUrl: 'https://youtube.com/watch?v=vid1&lc=c1',
        createdAt: new Date(),
        id: 'c1',
        text: 'Great video!',
      },
    ]);

    const result = await service.getInbox({
      brandId: 'brand-1',
      organizationId: 'org-1',
      platform: 'youtube',
    });

    expect(socialMonitorService.getUserTimeline).toHaveBeenCalledWith(
      'youtube',
      'https://www.youtube.com/@brandchannel',
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId: 'org-1',
        preferOfficialApi: true,
      }),
    );
    expect(socialMonitorService.getContentComments).toHaveBeenCalledWith(
      'youtube',
      'https://youtube.com/watch?v=vid1',
      expect.objectContaining({ brandId: 'brand-1' }),
    );
    expect(result.platform).toBe('youtube');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.commentText).toBe('Great video!');
  });

  it('returns empty items (not throw) when YouTube timeline fails', async () => {
    prisma.credential.findMany.mockResolvedValue([{ id: 'yt-cred' }]);
    credentialsService.findOne.mockResolvedValue({
      accessToken: '',
      externalId: 'UC123',
      id: 'yt-cred',
      username: 'brandchannel',
    });
    socialMonitorService.getUserTimeline.mockRejectedValue(
      new Error('quota exceeded'),
    );

    const result = await service.getInbox({
      brandId: 'brand-1',
      organizationId: 'org-1',
      platform: 'youtube',
    });

    expect(result.items).toEqual([]);
    expect(result.platform).toBe('youtube');
  });

  it('returns an empty inbox when no YouTube credential exists', async () => {
    prisma.credential.findMany.mockResolvedValue([]);
    credentialsService.findOne.mockResolvedValue(null);

    await expect(
      service.getInbox({
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: 'youtube',
      }),
    ).resolves.toEqual({ hours: 48, items: [], platform: 'youtube' });
    expect(socialMonitorService.getUserTimeline).not.toHaveBeenCalled();
  });

  it('normalizes UC channel ids to /channel/ URLs for timeline', async () => {
    prisma.credential.findMany.mockResolvedValue([{ id: 'yt-cred' }]);
    credentialsService.findOne.mockResolvedValue({
      accessToken: '',
      externalId: 'UCabcdefghijklmnopqrstuv',
      id: 'yt-cred',
      username: undefined,
    });
    socialMonitorService.getUserTimeline.mockResolvedValue([]);
    socialMonitorService.getContentComments.mockResolvedValue([]);

    await service.getInbox({
      brandId: 'brand-1',
      organizationId: 'org-1',
      platform: 'youtube',
    });

    expect(socialMonitorService.getUserTimeline).toHaveBeenCalledWith(
      'youtube',
      'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
      expect.any(Object),
    );
  });
});
