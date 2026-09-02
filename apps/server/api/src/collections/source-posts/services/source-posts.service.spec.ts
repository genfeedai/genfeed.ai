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
    // Multi-account resolution routes through `resolveBrandAccount`; the
    // double answers with whatever `findOne` is primed to return so the
    // existing cases keep describing one connected account.
    resolveBrandAccount: vi.fn((options: { credentialId?: string | null }) =>
      credentialsService.findOne(options),
    ),
  };
  const sourcePost = {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  };
  const ingredient = {
    findFirst: vi.fn(),
  };
  const post = {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  };
  const listeningTheme = {
    findFirst: vi.fn(),
  };

  let service: SourcePostsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SourcePostsService(
      {
        ingredient,
        listeningTheme,
        post,
        sourcePost,
      } as unknown as PrismaService,
      logger,
      credentialsService as never,
    );
  });

  it('rejects missing and blank external identifiers before the Prisma upsert', async () => {
    const savedPost = { externalId: 'post-1', id: 'source-post-1' };
    const postScope = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      sourceId: 'source-1',
    };
    sourcePost.upsert.mockResolvedValue(savedPost);

    const result = await service.upsertCollectedPosts(
      {
        brandId: 'brand-1',
        handle: 'openai',
        id: 'source-1',
        organizationId: 'org-1',
        platform: SocialSourcePlatform.TWITTER,
        userId: 'user-1',
      },
      [
        {
          ...postScope,
          contentType: 'tweet',
          externalId: undefined as never,
          platform: SocialSourcePlatform.TWITTER,
        },
        {
          ...postScope,
          contentType: 'tweet',
          externalId: '   ',
          platform: SocialSourcePlatform.TWITTER,
        },
        {
          ...postScope,
          contentType: 'tweet',
          externalId: 'post-1',
          platform: SocialSourcePlatform.TWITTER,
        },
      ],
    );

    expect(result).toEqual({ posts: [savedPost], rejectedCount: 2 });
    expect(sourcePost.upsert).toHaveBeenCalledTimes(1);
    expect(sourcePost.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceId_externalId: {
            externalId: 'post-1',
            sourceId: 'source-1',
          },
        },
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Rejected collected posts without stable external identifiers',
      { rejectedCount: 2, sourceId: 'source-1' },
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

  it('filters source posts by the canonical sourceId without loading relations', async () => {
    sourcePost.findMany.mockResolvedValue([]);
    sourcePost.count.mockResolvedValue(0);

    await service.listByBrand(
      { brandId: 'brand-1', organizationId: 'org-1' },
      { sourceId: 'source-1' },
    );

    expect(sourcePost.findMany).toHaveBeenCalledWith({
      orderBy: [{ publishedAt: 'desc' }, { collectedAt: 'desc' }],
      skip: 0,
      take: 25,
      where: {
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        sourceId: 'source-1',
      },
    });
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
      label: 'Quote: @source',
      status: 'draft',
    });

    const result = await service.createDraftFromPost(
      'source-post-1',
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      { actionType: SourcePostActionType.QUOTE },
    );

    expect(credentialsService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId: 'org-1',
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

  it('creates a native repost draft labeled distinctly from quote', async () => {
    sourcePost.findFirst.mockResolvedValue({
      authorHandle: 'genfeed',
      brandId: 'brand-1',
      externalId: 'tweet-2',
      id: 'source-post-2',
      organizationId: 'org-1',
      platform: SocialSourcePlatform.TWITTER,
      text: 'Ship it',
    });
    credentialsService.findOne.mockResolvedValue({
      id: 'credential-1',
      platform: 'twitter',
    });
    post.create.mockResolvedValue({
      id: 'draft-repost',
      label: 'Repost: @genfeed',
      status: 'draft',
    });

    const result = await service.createDraftFromPost(
      'source-post-2',
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      { actionType: SourcePostActionType.REPOST },
    );

    expect(post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        label: 'Repost: @genfeed',
        quoteTweetId: null,
        sourceActionId: 'source-post-2',
      }),
    });
    expect(result.draftId).toBe('draft-repost');
  });

  it('validates scoped theme evidence before creating an attributed response draft', async () => {
    sourcePost.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      externalId: 'tweet-3',
      id: 'source-post-3',
      organizationId: 'org-1',
      platform: SocialSourcePlatform.TWITTER,
      text: 'Theme evidence',
    });
    listeningTheme.findFirst.mockResolvedValue({
      evidence: [
        {
          evidence: { id: 'evidence-1', sourcePostId: 'source-post-3' },
        },
      ],
      id: 'theme-1',
    });
    credentialsService.findOne.mockResolvedValue({
      id: 'credential-1',
      platform: 'twitter',
    });
    post.upsert.mockResolvedValue({
      id: 'draft-attributed',
      status: 'draft',
    });

    const result = await service.createDraftFromPost(
      'source-post-3',
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'legacyUser42' },
      {
        actionType: SourcePostActionType.REPLY,
        listeningEvidenceIds: ['evidence-1'],
        listeningThemeId: 'theme-1',
        listeningTopicId: 'topic-1',
      },
    );

    expect(listeningTheme.findFirst).toHaveBeenCalledWith({
      include: {
        evidence: {
          include: {
            evidence: { select: { id: true, sourcePostId: true } },
          },
          where: {
            evidence: {
              brandId: 'brand-1',
              id: { in: ['evidence-1'] },
              isDeleted: false,
              organizationId: 'org-1',
              topicId: 'topic-1',
            },
          },
        },
      },
      where: {
        brandId: 'brand-1',
        id: 'theme-1',
        isDeleted: false,
        organizationId: 'org-1',
        topic: {
          is: {
            brandId: 'brand-1',
            isDeleted: false,
            organizationId: 'org-1',
          },
        },
        topicId: 'topic-1',
      },
    });
    expect(post.upsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        listeningEvidenceIds: ['evidence-1'],
        listeningThemeId: 'theme-1',
        listeningTopicId: 'topic-1',
        sourceActionId: 'source-post-3',
        targetIdempotencyKey: expect.stringMatching(/^listening-response:/),
        userId: 'legacyUser42',
      }),
      update: { isDeleted: false },
      where: {
        organizationId_targetIdempotencyKey: {
          organizationId: 'org-1',
          targetIdempotencyKey: expect.stringMatching(/^listening-response:/),
        },
      },
    });
    expect(post.create).not.toHaveBeenCalled();
    expect(result.draftId).toBe('draft-attributed');
  });

  it.each([
    ['missing evidence', { evidence: [], id: 'theme-1' }],
    [
      'foreign evidence',
      {
        evidence: [
          {
            evidence: {
              id: 'foreign-evidence',
              sourcePostId: 'source-post-4',
            },
          },
        ],
        id: 'theme-1',
      },
    ],
    [
      'theme evidence for another source post',
      {
        evidence: [
          {
            evidence: {
              id: 'evidence-1',
              sourcePostId: 'other-source-post',
            },
          },
        ],
        id: 'theme-1',
      },
    ],
  ])('rejects %s before any Post write', async (_label, theme) => {
    sourcePost.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      externalId: 'tweet-4',
      id: 'source-post-4',
      organizationId: 'org-1',
      platform: SocialSourcePlatform.TWITTER,
      text: 'Untrusted evidence',
    });
    listeningTheme.findFirst.mockResolvedValue(theme);

    await expect(
      service.createDraftFromPost(
        'source-post-4',
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
        {
          actionType: SourcePostActionType.REPLY,
          listeningEvidenceIds: ['evidence-1'],
          listeningThemeId: 'theme-1',
          listeningTopicId: 'topic-1',
        },
      ),
    ).rejects.toThrow('Listening attribution evidence is unavailable');

    expect(credentialsService.findOne).not.toHaveBeenCalled();
    expect(post.create).not.toHaveBeenCalled();
    expect(post.upsert).not.toHaveBeenCalled();
  });

  it('attaches an image ingredient to a scoped post draft', async () => {
    post.findFirst.mockResolvedValue({
      id: 'post-1',
      ingredients: [{ id: 'existing-ingredient' }],
    });
    ingredient.findFirst.mockResolvedValue({ id: 'new-ingredient' });
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
    expect(ingredient.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        brandId: 'brand-1',
        id: 'new-ingredient',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(post.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ingredients: {
          set: [{ id: 'existing-ingredient' }, { id: 'new-ingredient' }],
        },
      }),
      where: {
        brandId: 'brand-1',
        id: 'post-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('rejects an image ingredient outside the scoped brand', async () => {
    post.findFirst.mockResolvedValue({ id: 'post-1', ingredients: [] });
    ingredient.findFirst.mockResolvedValue(null);

    await expect(
      service.attachIngredientToPost('post-1', 'other-brand-ingredient', {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).rejects.toThrow('Image ingredient not found for post attachment');

    expect(post.update).not.toHaveBeenCalled();
  });
});
