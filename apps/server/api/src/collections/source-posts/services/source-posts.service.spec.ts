vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { SourcePostsService } from '@api/collections/source-posts/services/source-posts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SocialSourcePlatform, SourcePostActionType } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

describe('SourcePostsService', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const credentialsService = {
    findOne: vi.fn(),
  };
  const twitterPipelineService = {
    publish: vi.fn(),
  };
  const sourcePost = {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  };
  const post = {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  };

  let service: SourcePostsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SourcePostsService(
      { post, sourcePost } as unknown as PrismaService,
      logger,
      credentialsService as never,
      twitterPipelineService as never,
    );
  });

  it('builds a weekly corpus scoped by organization and brand', async () => {
    sourcePost.findMany.mockResolvedValue([
      {
        authorHandle: 'source',
        metrics: { comments: 2, likes: 10 },
        platform: 'twitter',
        publishedAt: new Date('2026-07-08T10:00:00Z'),
        sourceUrl: 'https://x.com/source/status/1',
        text: 'AI content generation is shifting toward operators.',
      },
    ]);

    const result = await service.getWeeklyCorpus('org-1', 'brand-1', 7, 25);

    expect(sourcePost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
        where: expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-1',
        }),
      }),
    );
    expect(result.count).toBe(1);
    expect(result.corpus).toContain('@source');
    expect(result.corpus).toContain('AI content generation');
  });

  it('creates a quote draft from a scoped source post', async () => {
    sourcePost.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      externalId: 'tweet-1',
      id: 'source-post-1',
      organizationId: 'org-1',
      platform: SocialSourcePlatform.TWITTER,
      text: 'Interesting AI post',
    });
    credentialsService.findOne.mockResolvedValue({
      id: 'credential-1',
      platform: 'twitter',
    });
    post.create.mockResolvedValue({
      id: 'draft-1',
      label: 'QRT: @source',
      status: 'draft',
    });

    const result = await service.createDraftFromPost(
      'source-post-1',
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      { actionType: SourcePostActionType.QUOTE },
    );

    expect(credentialsService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: 'brand-1',
        organization: 'org-1',
        platform: 'twitter',
      }),
    );
    expect(post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        credentialId: 'credential-1',
        organizationId: 'org-1',
        quoteTweetId: 'tweet-1',
        sourceActionId: 'source-post-1',
        userId: 'user-1',
      }),
    });
    expect(result.draftId).toBe('draft-1');
  });

  it('attaches an image ingredient to a scoped post draft', async () => {
    post.findFirst.mockResolvedValue({
      id: 'post-1',
      ingredients: [{ id: 'existing-ingredient' }],
    });
    post.update.mockResolvedValue({ id: 'post-1' });

    await service.attachIngredientToPost('post-1', 'new-ingredient', {
      brandId: 'brand-1',
      organizationId: 'org-1',
    });

    expect(post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          id: 'post-1',
          organizationId: 'org-1',
        }),
      }),
    );
    expect(post.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ingredients: {
          set: [{ id: 'existing-ingredient' }, { id: 'new-ingredient' }],
        },
      }),
      where: { id: 'post-1' },
    });
  });
});
