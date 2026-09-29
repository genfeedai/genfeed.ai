import { PostsService } from '@api/collections/posts/services/posts.service';
import { YoutubeUploadCompletionService } from '@api/services/integrations/youtube/services/modules/youtube-upload-completion.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';
import { PostVisibility, TargetExecutionState } from '@genfeedai/contracts';
import { RedisService } from '@libs/redis/redis.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('YoutubeUploadCompletionService', () => {
  let service: YoutubeUploadCompletionService;
  let redisService: { subscribe: ReturnType<typeof vi.fn> };
  let postsService: { patch: ReturnType<typeof vi.fn> };
  let publishEventWebhookService: {
    emitLegacyPostFailed: ReturnType<typeof vi.fn>;
    emitLegacyPostPublished: ReturnType<typeof vi.fn>;
  };
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
    publishEventWebhookService = {
      emitLegacyPostFailed: vi.fn().mockResolvedValue(undefined),
      emitLegacyPostPublished: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeUploadCompletionService,
        { provide: RedisService, useValue: redisService },
        { provide: PostsService, useValue: postsService },
        {
          provide: PublishEventWebhookService,
          useValue: publishEventWebhookService,
        },
      ],
    }).compile();

    service = module.get<YoutubeUploadCompletionService>(
      YoutubeUploadCompletionService,
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
          targetExecutionState: TargetExecutionState.PUBLISHED,
          visibility: PostVisibility.PUBLIC,
        }),
      );
    });
    expect(
      publishEventWebhookService.emitLegacyPostPublished,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        externalProviderId: 'yt-vid-1',
        platform: 'youtube',
        url: 'https://youtube.com/watch?v=yt-vid-1',
      }),
    );
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
          targetExecutionState: TargetExecutionState.FAILED,
        }),
      );
    });
    expect(
      publishEventWebhookService.emitLegacyPostFailed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Upload quota exceeded',
        platform: 'youtube',
      }),
    );
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
          targetExecutionState: TargetExecutionState.SCHEDULED,
        }),
      );
    });
    expect(
      publishEventWebhookService.emitLegacyPostPublished,
    ).not.toHaveBeenCalled();
    expect(
      publishEventWebhookService.emitLegacyPostFailed,
    ).not.toHaveBeenCalled();
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
});
