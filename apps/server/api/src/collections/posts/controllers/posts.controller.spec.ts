import 'reflect-metadata';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import {
  ApiKeyScope,
  CredentialPlatform,
  PostCategory,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { PostsQueryDto } from '../dto/posts-query.dto';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    organizationId: 'org-1',
    brandId: 'brand-1',
    userId: 'user-1',
    role: 'member',
    ...overrides,
  }) as unknown as User;

describe('PostsController.buildFindAllQuery', () => {
  let controller: PostsController;

  beforeEach(() => {
    // Minimal stub — only buildFindAllQuery is under test here
    controller = {
      buildFindAllQuery: PostsController.prototype.buildFindAllQuery,
    } as unknown as PostsController;
  });

  it('uses parentId (scalar FK) not parent (relation alias)', () => {
    const query: PostsQueryDto = {} as PostsQueryDto;
    const result = controller.buildFindAllQuery(makeUser(), query);

    const orFilter = (result.where as Record<string, unknown>).OR as Record<
      string,
      unknown
    >[];

    expect(orFilter).toBeDefined();

    expect(result.where).not.toHaveProperty('parent');
    expect(result.where).toHaveProperty('parentId', null);
  });

  it('includes { parentId: null } branch for top-level posts', () => {
    const query: PostsQueryDto = {} as PostsQueryDto;
    const result = controller.buildFindAllQuery(makeUser(), query);

    expect(result.where).toMatchObject({ parentId: null });
  });

  it('keeps ownership branches on canonical scalar FKs', () => {
    const query: PostsQueryDto = {} as PostsQueryDto;
    const result = controller.buildFindAllQuery(makeUser(), query);

    const orFilter = (result.where as Record<string, unknown>).OR as Record<
      string,
      unknown
    >[];

    expect(orFilter).toEqual(
      expect.arrayContaining([
        { userId: 'user-1' },
        { organizationId: 'org-1' },
      ]),
    );
  });

  it('maps publicationState posted onto the live status set', () => {
    const query = { publicationState: 'posted' } as PostsQueryDto;
    const result = controller.buildFindAllQuery(makeUser(), query);

    expect(result.where).toMatchObject({
      AND: [
        {
          targetExecutionState: TargetExecutionState.PUBLISHED,
        },
      ],
    });
  });

  it('maps publicationState not-posted onto the work-in-progress complement', () => {
    const query = { publicationState: 'not-posted' } as PostsQueryDto;
    const result = controller.buildFindAllQuery(makeUser(), query);

    expect(result.where).toMatchObject({
      AND: [
        {
          NOT: {
            targetExecutionState: TargetExecutionState.PUBLISHED,
          },
        },
      ],
    });
  });

  it('lets an explicit executionState filter win over publicationState', () => {
    const query = {
      executionState: TargetExecutionState.FAILED,
      publicationState: 'posted',
    } as PostsQueryDto;
    const result = controller.buildFindAllQuery(makeUser(), query);

    expect(result.where).toMatchObject({
      AND: [
        {
          targetExecutionState: TargetExecutionState.FAILED,
        },
      ],
    });
    expect(JSON.stringify(result.where)).not.toContain('"status"');
  });

  it('ignores leftover Post.status query params', () => {
    const query = { status: 'draft' } as PostsQueryDto & { status: string };
    const result = controller.buildFindAllQuery(makeUser(), query);

    expect(JSON.stringify(result.where)).not.toContain('"status"');
  });
});

describe('PostsController.create account-health warmup gate', () => {
  const request = {
    get: vi.fn().mockReturnValue('localhost'),
    headers: {},
    path: '/posts',
    protocol: 'https',
  } as never;

  it('holds scheduled posts as pending when account warmup is not ready', async () => {
    const activitiesService = { create: vi.fn().mockResolvedValue({}) };
    const accountHealthService = {
      evaluateScheduledPublishGate: vi.fn().mockResolvedValue({
        holdPublishing: true,
        reason: 'twitter publishing is held because account warmup is warming.',
        summary: {},
      }),
    };
    const credentialsService = {
      findOne: vi.fn().mockResolvedValue({
        id: 'credential-1',
        description: 'Account description',
        label: 'X Account',
        platform: CredentialPlatform.TWITTER,
      }),
    };
    const ingredientsService = {
      findApprovedImagesByCampaign: vi.fn(),
      findByIds: vi.fn(),
    };
    const quotaService = { verifyQuota: vi.fn().mockResolvedValue(undefined) };
    const postsService = {
      create: vi.fn().mockResolvedValue({
        id: 'post-1',
        status: PostStatus.PENDING,
      }),
      handleYoutubePost: vi.fn(),
    };
    const controller = new PostsController(
      activitiesService as never,
      accountHealthService as never,
      credentialsService as never,
      ingredientsService as never,
      quotaService as never,
      {} as never,
      postsService as never,
      { error: vi.fn(), log: vi.fn() } as never,
    );

    await controller.create(request, makeUser(), {
      category: PostCategory.TEXT,
      credentialId: 'credential-1',
      description: 'Scheduled content',
      ingredients: [],
      label: 'Scheduled content',
      scheduledDate: new Date('2026-07-01T10:00:00.000Z'),
      targetExecutionState: TargetExecutionState.SCHEDULED,
      tags: [],
    });

    expect(
      accountHealthService.evaluateScheduledPublishGate,
    ).toHaveBeenCalledWith({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });
    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        publishIntent: 'warmup_hold',
        reviewFeedback:
          'twitter publishing is held because account warmup is warming.',
        targetExecutionState: TargetExecutionState.PAUSED,
        visibility: PostVisibility.PUBLIC,
      }),
    );
    expect(postsService.handleYoutubePost).not.toHaveBeenCalled();
  });

  it('rejects a draft-only API key before scheduling side effects', async () => {
    const credentialsService = { findOne: vi.fn() };
    const controller = new PostsController(
      {} as never,
      {} as never,
      credentialsService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { error: vi.fn(), log: vi.fn() } as never,
    );

    await expect(
      controller.create(
        request,
        makeUser({
          isApiKey: true,
          scopes: [ApiKeyScope.POSTS_CREATE],
        }),
        {
          category: PostCategory.TEXT,
          credentialId: 'credential-1',
          description: 'Scheduled content',
          ingredients: [],
          label: 'Scheduled content',
          scheduledDate: new Date('2026-07-01T10:00:00.000Z'),
          targetExecutionState: TargetExecutionState.SCHEDULED,
          tags: [],
        },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
      }),
    });
    expect(credentialsService.findOne).not.toHaveBeenCalled();
  });

  it('treats omitted execution state as draft when no scheduled date is set', async () => {
    const credentialsService = { findOne: vi.fn().mockResolvedValue(null) };
    const controller = new PostsController(
      {} as never,
      {} as never,
      credentialsService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { error: vi.fn(), log: vi.fn() } as never,
    );

    await expect(
      controller.create(
        request,
        makeUser({
          isApiKey: true,
          scopes: [ApiKeyScope.POSTS_DRAFT],
        }),
        {
          category: PostCategory.TEXT,
          credentialId: 'credential-1',
          description: 'Draft content',
          ingredients: [],
          label: 'Draft content',
          tags: [],
        },
      ),
    ).rejects.toBeDefined();
    expect(credentialsService.findOne).toHaveBeenCalled();
  });

  it('declares all dynamically resolved post creation scopes', () => {
    expect(
      Reflect.getMetadata(API_KEY_SCOPES_KEY, PostsController.prototype.create),
    ).toEqual([
      ApiKeyScope.POSTS_DRAFT,
      ApiKeyScope.POSTS_CREATE,
      ApiKeyScope.POSTS_SCHEDULE,
      ApiKeyScope.POSTS_PUBLISH,
    ]);
  });
});

describe('PostsController.patch publishing scopes', () => {
  const request = {
    context: {},
    get: vi.fn().mockReturnValue('localhost'),
    headers: {},
    path: '/posts/ckpost0000000000000000001',
    protocol: 'https',
  } as never;
  const postId = 'ckpost0000000000000000001';

  const makeController = (existingState: TargetExecutionState) => {
    const postsService = {
      findOne: vi.fn().mockResolvedValue({
        id: postId,
        targetExecutionState: existingState,
        userId: 'user-1',
      }),
      patch: vi.fn(),
    };
    return {
      controller: new PostsController(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        postsService as never,
        { error: vi.fn(), log: vi.fn() } as never,
      ),
      postsService,
    };
  };

  it.each([
    [
      'moving a draft to scheduled',
      TargetExecutionState.DRAFT,
      { targetExecutionState: TargetExecutionState.SCHEDULED },
      [ApiKeyScope.POSTS_CREATE],
      ApiKeyScope.POSTS_SCHEDULE,
    ],
    [
      'editing an existing scheduled post',
      TargetExecutionState.SCHEDULED,
      { label: 'Changed label' },
      [ApiKeyScope.POSTS_CREATE],
      ApiKeyScope.POSTS_SCHEDULE,
    ],
    [
      'moving a draft to published',
      TargetExecutionState.DRAFT,
      { targetExecutionState: TargetExecutionState.PUBLISHED },
      [ApiKeyScope.POSTS_SCHEDULE],
      ApiKeyScope.POSTS_PUBLISH,
    ],
  ])(
    'fails closed before writes when %s',
    async (_case, existingState, updateDto, scopes, requiredScope) => {
      const { controller, postsService } = makeController(existingState);

      await expect(
        controller.patch(
          request,
          makeUser({ isApiKey: true, scopes }),
          postId,
          updateDto,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
          requiredScopes: [requiredScope],
        }),
      });
      expect(postsService.patch).not.toHaveBeenCalled();
    },
  );
});

describe('PostsController.findAll (#1223)', () => {
  const request = {
    get: vi.fn().mockReturnValue('localhost'),
    headers: {},
    originalUrl: '/v1/posts',
    path: '/posts',
    protocol: 'https',
  } as never;

  const makeController = (findAll: ReturnType<typeof vi.fn>) =>
    new PostsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { findAll } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn() } as never,
    );

  const paginated = (docs: Array<Record<string, unknown>>) => ({
    docs,
    hasNextPage: false,
    hasPrevPage: false,
    limit: 20,
    nextPage: null,
    page: 1,
    pages: 1,
    pagingCounter: 1,
    prevPage: null,
    total: docs.length,
    totalDocs: docs.length,
    totalPages: 1,
  });

  it('returns a JSON:API collection document ({ data: [...] }), not a raw docs array', async () => {
    const findAll = vi.fn().mockResolvedValue(
      paginated([
        {
          id: 'ckpost0000000000000000001',
          label: 'A',
          status: PostStatus.DRAFT,
        },
        {
          id: 'ckpost0000000000000000002',
          label: 'B',
          status: PostStatus.SCHEDULED,
        },
      ]),
    );
    const controller = makeController(findAll);

    const result = (await controller.findAll(
      request,
      makeUser(),
      {} as PostsQueryDto,
    )) as { data: Array<{ id: string; type: string }> };

    // Before the fix, `PostListSerializer` was `undefined`, so
    // `serializeCollection` returned the raw `docs` array — the exact shape the
    // calendar client rejects with "expected collection data".
    expect(Array.isArray(result)).toBe(false);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      id: 'ckpost0000000000000000001',
      type: 'post',
    });
  });

  it('serializes an empty result set as { data: [] }', async () => {
    const findAll = vi.fn().mockResolvedValue(paginated([]));
    const controller = makeController(findAll);

    const result = (await controller.findAll(
      request,
      makeUser(),
      {} as PostsQueryDto,
    )) as { data: unknown[] };

    expect(result.data).toEqual([]);
  });

  it('is no longer restricted to superadmins (no roles metadata on the handler)', () => {
    // The prior `@RolesDecorator('superadmin')` 403'd every non-superadmin,
    // breaking the normal-user calendar. Removing it falls back to the
    // class-level RolesGuard (org-membership) + ownership-scoped query.
    const roles = Reflect.getMetadata(
      'roles',
      PostsController.prototype.findAll,
    );
    expect(roles).toBeUndefined();
  });
});

describe('PostsService.listContentMentions', () => {
  const prisma = {
    post: {
      findMany: vi.fn(),
    },
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  };

  let service: PostsService;

  beforeEach(() => {
    prisma.post.findMany.mockReset();
    service = new PostsService(prisma as never, logger as never);
  });

  it('returns recent organization posts as content mentions', async () => {
    prisma.post.findMany.mockResolvedValue([
      {
        category: PostCategory.TEXT,
        description: 'Fallback text',
        entityArticle: null,
        entityIngredient: {
          cdnUrl: 'https://cdn.test/image.png',
          sampleAudioUrl: null,
        },
        id: 'post-1',
        label: 'Launch thread',
      },
      {
        category: PostCategory.IMAGE,
        description: 'Article fallback',
        entityArticle: {
          coverImageUrl: 'https://cdn.test/article.png',
          label: 'Article title',
        },
        entityIngredient: null,
        id: 'post-2',
        label: null,
      },
    ]);

    const result = await service.listContentMentions('org-1');

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        where: {
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(result).toEqual([
      {
        contentTitle: 'Launch thread',
        contentType: 'text',
        id: 'post-1',
        thumbnailUrl: 'https://cdn.test/image.png',
      },
      {
        contentTitle: 'Article title',
        contentType: 'image',
        id: 'post-2',
        thumbnailUrl: 'https://cdn.test/article.png',
      },
    ]);
  });

  it('does not query without organization scope', async () => {
    const result = await service.listContentMentions('');

    expect(result).toEqual([]);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });
});
