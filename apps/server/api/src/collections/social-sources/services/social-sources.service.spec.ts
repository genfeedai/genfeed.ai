vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { SocialSourcesService } from '@api/collections/social-sources/services/social-sources.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ReplyBotPlatform,
  SocialContentType,
  SocialSourcePlatform,
} from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

describe('SocialSourcesService', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const sourcePostsService = {
    listByBrand: vi.fn(),
    upsertCollectedPosts: vi.fn(),
  };
  const socialMonitorService = {
    getUserTimeline: vi.fn(),
  };
  const brand = {
    findFirst: vi.fn(),
  };
  const socialSource = {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  };

  let service: SocialSourcesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SocialSourcesService(
      { brand, socialSource } as unknown as PrismaService,
      logger,
      sourcePostsService as never,
      socialMonitorService as never,
    );
  });

  it('creates a brand-scoped source with normalized handle', async () => {
    brand.findFirst.mockResolvedValue({ id: 'brand-1' });
    socialSource.create.mockResolvedValue({
      brandId: 'brand-1',
      handle: 'openai',
      id: 'source-1',
      organizationId: 'org-1',
      platform: SocialSourcePlatform.TWITTER,
    });

    await service.createScoped(
      { handle: '@OpenAI', platform: SocialSourcePlatform.TWITTER },
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
    );

    expect(brand.findFirst).toHaveBeenCalledWith({
      where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(socialSource.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        handle: 'openai',
        organizationId: 'org-1',
        profileUrl: 'https://x.com/openai',
        userId: 'user-1',
      }),
    });
  });

  it('syncs a source through SocialMonitorService and stores normalized posts', async () => {
    socialSource.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      handle: 'openai',
      id: 'source-1',
      organizationId: 'org-1',
      platform: SocialSourcePlatform.TWITTER,
      userId: 'user-1',
    });
    socialMonitorService.getUserTimeline.mockResolvedValue([
      {
        authorDisplayName: 'OpenAI',
        authorId: 'author-1',
        authorUsername: 'openai',
        contentType: SocialContentType.TWEET,
        contentUrl: 'https://x.com/openai/status/1',
        createdAt: new Date('2026-07-08T10:00:00Z'),
        id: 'tweet-1',
        metrics: { comments: 1, likes: 20 },
        platform: ReplyBotPlatform.TWITTER,
        text: 'AI source post',
      },
    ]);
    sourcePostsService.upsertCollectedPosts.mockResolvedValue([
      { id: 'post-1' },
    ]);
    socialSource.update.mockResolvedValue({ id: 'source-1' });

    const result = await service.syncSource('source-1', {
      brandId: 'brand-1',
      organizationId: 'org-1',
    });

    expect(socialMonitorService.getUserTimeline).toHaveBeenCalledWith(
      ReplyBotPlatform.TWITTER,
      'openai',
      { limit: 25, sinceId: undefined },
    );
    expect(sourcePostsService.upsertCollectedPosts).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'source-1' }),
      [
        expect.objectContaining({
          authorHandle: 'openai',
          externalId: 'tweet-1',
          sourceUrl: 'https://x.com/openai/status/1',
        }),
      ],
    );
    expect(result.count).toBe(1);
  });
});
