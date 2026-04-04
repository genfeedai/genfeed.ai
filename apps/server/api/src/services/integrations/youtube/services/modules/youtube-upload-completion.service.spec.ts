import { PostsService } from '@api/collections/posts/services/posts.service';
import { YoutubeUploadCompletionService } from '@api/services/integrations/youtube/services/modules/youtube-upload-completion.service';
import { PostStatus } from '@genfeedai/enums';
import { RedisService } from '@libs/redis/redis.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('YoutubeUploadCompletionService', () => {
  let service: YoutubeUploadCompletionService;
  let redisService: { subscribe: ReturnType<typeof vi.fn> };
  let postsService: { patch: ReturnType<typeof vi.fn> };
  let capturedHandler: (data: unknown) => void;

  beforeEach(async () => {
    redisService = {
      subscribe: vi
        .fn()
        .mockImplementation(
          (_channel: string, handler: (data: unknown) => void) => {
            capturedHandler = handler;
            return Promise.resolve();
          },
        ),
    };

    postsService = {
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeUploadCompletionService,
        { provide: RedisService, useValue: redisService },
        { provide: PostsService, useValue: postsService },
      ],
    }).compile();

    service = module.get<YoutubeUploadCompletionService>(
      YoutubeUploadCompletionService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should subscribe to youtube:upload:complete on module init', async () => {
    await service.onModuleInit();
    expect(redisService.subscribe).toHaveBeenCalledWith(
      'youtube:upload:complete',
      expect.any(Function),
    );
  });

  it('should update post status to PUBLIC when status is "public"', async () => {
    await service.onModuleInit();

    const data = {
      organizationId: 'org-1',
      postId: 'post-123',
      result: {
        externalId: 'yt-vid-1',
        videoUrl: 'https://youtube.com/watch?v=yt-vid-1',
      },
      status: 'public',
      timestamp: new Date().toISOString(),
      userId: 'user-1',
    };

    await capturedHandler(data);

    // Allow the void promise to resolve
    await vi.waitFor(() => {
      expect(postsService.patch).toHaveBeenCalledWith(
        'post-123',
        expect.objectContaining({
          externalId: 'yt-vid-1',
          status: PostStatus.PUBLIC,
        }),
      );
    });
  });

  it('should update post status to PRIVATE when status is "private"', async () => {
    await service.onModuleInit();

    const data = {
      organizationId: 'org-1',
      postId: 'post-456',
      result: {
        externalId: 'yt-vid-2',
        videoUrl: 'https://youtube.com/watch?v=yt-vid-2',
      },
      status: 'private',
      timestamp: new Date().toISOString(),
      userId: 'user-1',
    };

    await capturedHandler(data);

    await vi.waitFor(() => {
      expect(postsService.patch).toHaveBeenCalledWith(
        'post-456',
        expect.objectContaining({
          externalId: 'yt-vid-2',
          status: PostStatus.PRIVATE,
        }),
      );
    });
  });

  it('should update post status to UNLISTED when status is "unlisted"', async () => {
    await service.onModuleInit();

    const data = {
      organizationId: 'org-1',
      postId: 'post-789',
      result: {
        externalId: 'yt-vid-3',
        videoUrl: 'https://youtube.com/watch?v=yt-vid-3',
      },
      status: 'unlisted',
      timestamp: new Date().toISOString(),
      userId: 'user-1',
    };

    await capturedHandler(data);

    await vi.waitFor(() => {
      expect(postsService.patch).toHaveBeenCalledWith(
        'post-789',
        expect.objectContaining({
          status: PostStatus.UNLISTED,
        }),
      );
    });
  });

  it('should set publicationDate for published statuses (public, private, unlisted)', async () => {
    await service.onModuleInit();

    const data = {
      organizationId: 'org-1',
      postId: 'post-pub',
      result: {
        externalId: 'yt-pub',
        videoUrl: 'https://youtube.com/watch?v=yt-pub',
      },
      status: 'public',
      timestamp: new Date().toISOString(),
      userId: 'user-1',
    };

    await capturedHandler(data);

    await vi.waitFor(() => {
      expect(postsService.patch).toHaveBeenCalledWith(
        'post-pub',
        expect.objectContaining({
          publicationDate: expect.any(Date),
        }),
      );
    });
  });

  it('should update post status to FAILED and include error when status is "failed"', async () => {
    await service.onModuleInit();

    const data = {
      error: 'Upload quota exceeded',
      organizationId: 'org-1',
      postId: 'post-fail',
      status: 'failed',
      timestamp: new Date().toISOString(),
      userId: 'user-1',
    };

    await capturedHandler(data);

    await vi.waitFor(() => {
      expect(postsService.patch).toHaveBeenCalledWith(
        'post-fail',
        expect.objectContaining({
          error: 'Upload quota exceeded',
          status: PostStatus.FAILED,
        }),
      );
    });
  });

  it('should update post status to SCHEDULED when status is "scheduled"', async () => {
    await service.onModuleInit();

    const data = {
      organizationId: 'org-1',
      postId: 'post-sched',
      result: {
        externalId: 'yt-sched',
        videoUrl: 'https://youtube.com/watch?v=yt-sched',
      },
      status: 'scheduled',
      timestamp: new Date().toISOString(),
      userId: 'user-1',
    };

    await capturedHandler(data);

    await vi.waitFor(() => {
      expect(postsService.patch).toHaveBeenCalledWith(
        'post-sched',
        expect.objectContaining({
          status: PostStatus.SCHEDULED,
        }),
      );
    });
  });

  it('should not set publicationDate for scheduled status', async () => {
    await service.onModuleInit();

    const data = {
      organizationId: 'org-1',
      postId: 'post-sched-2',
      result: {
        externalId: 'yt-sched-2',
        videoUrl: 'https://youtube.com/watch?v=yt-sched-2',
      },
      status: 'scheduled',
      timestamp: new Date().toISOString(),
      userId: 'user-1',
    };

    await capturedHandler(data);

    await vi.waitFor(() => {
      expect(postsService.patch).toHaveBeenCalled();
      const patchCall = postsService.patch.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patchCall.publicationDate).toBeUndefined();
    });
  });

  it('should handle error in postsService.patch gracefully without rethrowing', async () => {
    postsService.patch.mockRejectedValueOnce(new Error('DB connection lost'));
    await service.onModuleInit();

    const data = {
      organizationId: 'org-1',
      postId: 'post-err',
      result: {
        externalId: 'yt-err',
        videoUrl: 'https://youtube.com/watch?v=yt-err',
      },
      status: 'public',
      timestamp: new Date().toISOString(),
      userId: 'user-1',
    };

    // Should not throw — error is caught internally
    await capturedHandler(data);

    await vi.waitFor(() => {
      expect(postsService.patch).toHaveBeenCalled();
    });
  });

  it('should set externalId to undefined when result is null', async () => {
    await service.onModuleInit();

    const data = {
      error: 'Something broke',
      organizationId: 'org-1',
      postId: 'post-no-result',
      result: null,
      status: 'failed',
      timestamp: new Date().toISOString(),
      userId: 'user-1',
    };

    await capturedHandler(data);

    await vi.waitFor(() => {
      expect(postsService.patch).toHaveBeenCalledWith(
        'post-no-result',
        expect.objectContaining({
          error: 'Something broke',
          externalId: undefined,
        }),
      );
    });
  });
});
