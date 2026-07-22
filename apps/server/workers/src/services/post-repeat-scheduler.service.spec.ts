import { PostsService } from '@api/collections/posts/services/posts.service';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { PostRepeatSchedulerService } from '@workers/services/post-repeat-scheduler.service';

describe('PostRepeatSchedulerService', () => {
  let service: PostRepeatSchedulerService;
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let postsService: {
    create: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };

  const basePost = {
    brandId: 'brand-1',
    category: PostCategory.TEXT,
    children: [],
    credentialId: 'credential-1',
    description: 'Repeat me',
    id: 'post-1',
    ingredients: ['ingredient-1'],
    isRepeat: true,
    label: 'Repeated post',
    maxRepeats: 5,
    organizationId: 'organization-1',
    platform: CredentialPlatform.TWITTER,
    repeatCount: 0,
    repeatFrequency: 'daily',
    repeatInterval: 1,
    scheduledDate: new Date(2026, 6, 20, 10),
    status: PostStatus.PUBLIC,
    tags: ['repeat'],
    userId: 'user-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostRepeatSchedulerService,
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: PostsService,
          useValue: {
            create: vi.fn().mockResolvedValue({ id: 'post-2' }),
            patch: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(PostRepeatSchedulerService);
    loggerService = module.get(LoggerService);
    postsService = module.get(PostsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      expectedDate: new Date(2026, 6, 22, 10),
      frequency: 'daily',
      interval: 2,
    },
    {
      expectedDate: new Date(2026, 6, 22, 10),
      frequency: 'weekly',
      interval: 1,
      repeatDaysOfWeek: [3],
    },
    {
      expectedDate: new Date(2026, 7, 3, 10),
      frequency: 'weekly',
      interval: 2,
    },
    {
      expectedDate: new Date(2026, 8, 20, 10),
      frequency: 'monthly',
      interval: 2,
    },
    {
      expectedDate: new Date(2027, 6, 20, 10),
      frequency: 'yearly',
      interval: 1,
    },
  ])('schedules the next $frequency repeat with the existing date semantics', async ({
    expectedDate,
    frequency,
    interval,
    repeatDaysOfWeek,
  }) => {
    await service.scheduleNextRepeat(
      {
        ...basePost,
        repeatDaysOfWeek,
        repeatFrequency: frequency,
        repeatInterval: interval,
      } as never,
      'CronPostsService publish',
    );

    expect(postsService.patch).toHaveBeenCalledWith('post-1', {
      repeatCount: 1,
    });
    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: 'brand-1',
        credential: 'credential-1',
        organization: 'organization-1',
        repeatCount: 1,
        repeatFrequency: frequency,
        scheduledDate: expectedDate,
        user: 'user-1',
      }),
    );
  });

  it('increments the completed post and stops when repeats are exhausted', async () => {
    await service.scheduleNextRepeat(
      {
        ...basePost,
        maxRepeats: 3,
        repeatCount: 2,
      } as never,
      'CronPostsService publish',
    );

    expect(postsService.patch).toHaveBeenCalledWith('post-1', {
      repeatCount: 3,
    });
    expect(postsService.create).not.toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('maximum repeats reached'),
      expect.objectContaining({ repeatCount: 3 }),
    );
  });

  it('increments the completed post and stops after the repeat end date', async () => {
    await service.scheduleNextRepeat(
      {
        ...basePost,
        repeatEndDate: new Date('2000-01-01T00:00:00.000Z'),
      } as never,
      'CronPostsService publish',
    );

    expect(postsService.patch).toHaveBeenCalledWith('post-1', {
      repeatCount: 1,
    });
    expect(postsService.create).not.toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('repeat end date reached'),
      expect.objectContaining({ postId: 'post-1' }),
    );
  });

  it('preserves the no-op behavior for an invalid recurrence frequency', async () => {
    await service.scheduleNextRepeat(
      {
        ...basePost,
        repeatFrequency: 'invalid',
      } as never,
      'CronPostsService publish',
    );

    expect(postsService.patch).toHaveBeenCalledWith('post-1', {
      repeatCount: 1,
    });
    expect(postsService.create).not.toHaveBeenCalled();
    expect(loggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('unable to calculate next schedule date'),
      expect.objectContaining({ postId: 'post-1' }),
    );
  });

  it('clones thread children and isolates a child-clone failure', async () => {
    postsService.create
      .mockResolvedValueOnce({ id: 'post-2' } as never)
      .mockRejectedValueOnce(new Error('child one failed'))
      .mockResolvedValueOnce({ id: 'child-2' } as never);

    await service.scheduleNextRepeat(
      {
        ...basePost,
        agentContextSource: 'explicit',
        agentContextVersion: 1,
        agentThreadId: 'thread-1',
        children: [
          {
            category: PostCategory.TEXT,
            description: 'First child',
            id: 'child-1',
            ingredients: [{ id: 'ingredient-2' }],
            order: 1,
          },
          {
            category: PostCategory.TEXT,
            description: 'Second child',
            id: 'child-2',
            ingredients: ['ingredient-3'],
            order: 2,
          },
        ],
      } as never,
      'CronPostsService publish',
    );

    expect(postsService.create).toHaveBeenCalledTimes(3);
    expect(postsService.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        agentThreadId: 'thread-1',
        ingredients: ['ingredient-3'],
        parent: 'post-2',
        scheduledDate: new Date(2026, 6, 21, 10),
      }),
    );
    expect(loggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to clone child for repeat'),
      expect.objectContaining({
        error: 'child one failed',
        originalChildId: 'child-1',
      }),
    );
  });

  it('contains parent persistence failures without changing publish completion', async () => {
    postsService.patch.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      service.scheduleNextRepeat(basePost as never, 'CronPostsService publish'),
    ).resolves.toBeUndefined();

    expect(postsService.create).not.toHaveBeenCalled();
    expect(loggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to schedule next repeat'),
      expect.objectContaining({ postId: 'post-1' }),
    );
  });
});
