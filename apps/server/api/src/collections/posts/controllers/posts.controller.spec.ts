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
