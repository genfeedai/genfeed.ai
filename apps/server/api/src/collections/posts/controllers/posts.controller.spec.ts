import 'reflect-metadata';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import type { PostsQueryDto } from '../dto/posts-query.dto';

const makeUser = (overrides: Partial<User['publicMetadata']> = {}): User =>
  ({
    publicMetadata: {
      organization: 'org-1',
      brand: 'brand-1',
      user: 'user-1',
      role: 'member',
      ...overrides,
    },
  }) as unknown as User;

describe('PostsController.buildFindAllQuery', () => {
  let controller: PostsController;

  beforeEach(() => {
    // Minimal stub — only buildFindAllQuery is under test here
    controller = {
      buildFindAllQuery: PostsController.prototype.buildFindAllQuery,
    } as unknown as PostsController;
  });

  it('uses parentId (scalar FK) not parent (relation alias) in OR filter', () => {
    const query: PostsQueryDto = {} as PostsQueryDto;
    const result = controller.buildFindAllQuery(makeUser(), query);

    const orFilter = (result.where as Record<string, unknown>).OR as Record<
      string,
      unknown
    >[];

    expect(orFilter).toBeDefined();

    const keys = orFilter.flatMap((branch) => Object.keys(branch));
    expect(keys).not.toContain('parent');
    expect(keys.filter((k) => k === 'parentId').length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('includes { parentId: null } branch for top-level posts', () => {
    const query: PostsQueryDto = {} as PostsQueryDto;
    const result = controller.buildFindAllQuery(makeUser(), query);

    const orFilter = (result.where as Record<string, unknown>).OR as Record<
      string,
      unknown
    >[];

    expect(orFilter).toContainEqual({ parentId: null });
  });

  it('includes { parentId: { not: null } } branch (has parent)', () => {
    const query: PostsQueryDto = {} as PostsQueryDto;
    const result = controller.buildFindAllQuery(makeUser(), query);

    const orFilter = (result.where as Record<string, unknown>).OR as Record<
      string,
      unknown
    >[];

    expect(orFilter).toContainEqual({ parentId: { not: null } });
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
        _id: 'credential-1',
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
        _id: 'post-1',
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
      credential: 'credential-1',
      description: 'Scheduled content',
      ingredients: [],
      label: 'Scheduled content',
      scheduledDate: new Date('2026-07-01T10:00:00.000Z'),
      status: PostStatus.SCHEDULED,
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
        status: PostStatus.PENDING,
      }),
    );
    expect(postsService.handleYoutubePost).not.toHaveBeenCalled();
  });
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
