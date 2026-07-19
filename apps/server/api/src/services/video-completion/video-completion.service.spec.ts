import { RawCutClipCompletionService } from '@api/collections/clip-projects/services/raw-cut-clip-completion.service';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { VideoCompletionService } from '@api/services/video-completion/video-completion.service';
import { IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('VideoCompletionService', () => {
  let service: VideoCompletionService;
  let redisService: vi.Mocked<RedisService>;
  let ingredientsService: vi.Mocked<IngredientsService>;
  let metadataService: vi.Mocked<MetadataService>;
  let editorProjectsService: {
    findRenderingProjects: ReturnType<typeof vi.fn>;
    markAsCompleted: ReturnType<typeof vi.fn>;
    markAsFailed: ReturnType<typeof vi.fn>;
    readRenderProvenance: ReturnType<typeof vi.fn>;
  };
  let fileQueueService: {
    getJobStatus: ReturnType<typeof vi.fn>;
  };
  let notificationsPublisher: {
    publishMediaFailed: ReturnType<typeof vi.fn>;
    publishVideoComplete: ReturnType<typeof vi.fn>;
  };
  let rawCutClipCompletionService: {
    handleCompletion: ReturnType<typeof vi.fn>;
    reconcileActiveClips: ReturnType<typeof vi.fn>;
  };
  let cacheService: {
    withLock: ReturnType<typeof vi.fn>;
  };

  const mockIngredientId = '507f1f77bcf86cd799439011';
  const mockUserId = '507f1f77bcf86cd799439012';
  const mockOrganizationId = '507f1f77bcf86cd799439013';

  async function waitForAsyncHandler(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(async () => {
    editorProjectsService = {
      findRenderingProjects: vi.fn().mockResolvedValue([]),
      markAsCompleted: vi.fn().mockResolvedValue(undefined),
      markAsFailed: vi.fn().mockResolvedValue(undefined),
      readRenderProvenance: vi.fn(),
    };
    fileQueueService = {
      getJobStatus: vi.fn(),
    };
    notificationsPublisher = {
      publishMediaFailed: vi.fn().mockResolvedValue(undefined),
      publishVideoComplete: vi.fn().mockResolvedValue(undefined),
    };
    rawCutClipCompletionService = {
      handleCompletion: vi.fn().mockResolvedValue(false),
      reconcileActiveClips: vi.fn().mockResolvedValue(undefined),
    };
    cacheService = {
      withLock: vi
        .fn()
        .mockImplementation(
          async (_key: string, run: () => Promise<void>) => await run(),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoCompletionService,
        {
          provide: EditorProjectsService,
          useValue: editorProjectsService,
        },
        {
          provide: FileQueueService,
          useValue: fileQueueService,
        },
        {
          provide: RedisService,
          useValue: {
            publish: vi.fn(),
            subscribe: vi.fn(),
          },
        },
        {
          provide: IngredientsService,
          useValue: {
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: MetadataService,
          useValue: {
            patch: vi.fn(),
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: notificationsPublisher,
        },
        {
          provide: RawCutClipCompletionService,
          useValue: rawCutClipCompletionService,
        },
        {
          provide: CacheService,
          useValue: cacheService,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<VideoCompletionService>(VideoCompletionService);
    redisService = module.get(RedisService);
    ingredientsService = module.get(IngredientsService);
    metadataService = module.get(MetadataService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should subscribe to video completion channel', async () => {
      await service.onModuleInit();

      expect(redisService.subscribe).toHaveBeenCalledWith(
        'video-processing-complete',
        expect.any(Function),
      );
    });
  });

  describe('handleVideoCompletion', () => {
    it('atomically completes an editor render from its durable event', async () => {
      const editorRender = {
        authProviderUserId: 'auth-user',
        ingredientId: mockIngredientId,
        jobId: 'job-123',
        metadataId: 'metadata-123',
        projectId: 'project-123',
        room: 'user-auth-user',
      };
      const output = {
        durationFrames: 300,
        durationSeconds: 10,
        fps: 30,
        height: 1080,
        rendererVersion: 'remotion@4.0.486',
        s3Key: 'videos/output.mp4',
        size: 4096,
        url: 'https://cdn.example.com/videos/output.mp4',
        width: 1920,
      };

      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];
      await subscribeCallback({
        editorRender,
        ingredientId: mockIngredientId,
        organizationId: mockOrganizationId,
        result: output,
        status: 'completed',
        timestamp: new Date().toISOString(),
      });

      expect(editorProjectsService.markAsCompleted).toHaveBeenCalledWith(
        'project-123',
        mockIngredientId,
        output,
        'job-123',
      );
      expect(metadataService.patch).toHaveBeenCalledWith('metadata-123', {
        duration: 10,
        height: 1080,
        label: 'Editor Render',
        size: 4096,
        width: 1920,
      });
      expect(notificationsPublisher.publishVideoComplete).toHaveBeenCalled();
    });

    it('should update ingredient status to COMPLETED on successful processing', async () => {
      const mockData = {
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        result: {
          metadata: {
            duration: 10.5,
            height: 1080,
            width: 1920,
          },
          publicUrl: 'https://example.com/video.mp4',
          s3Key: 'ingredients/videos/507f1f77bcf86cd799439011',
        },
        status: 'completed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      ingredientsService.findOne.mockResolvedValue({
        _id: mockIngredientId,
        metadata: '507f1f77bcf86cd799439099',
      } as never);
      ingredientsService.patch.mockResolvedValue({
        _id: mockIngredientId,
        status: IngredientStatus.GENERATED,
      });

      // Get the callback function passed to subscribe
      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      // Call the callback with mock data
      await subscribeCallback(mockData);
      await waitForAsyncHandler();

      expect(ingredientsService.patch).toHaveBeenCalledWith(
        mockData.ingredientId,
        {
          s3Key: mockData.result.s3Key,
          status: IngredientStatus.GENERATED,
        },
      );
      expect(metadataService.patch).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439099',
        {
          duration: 10.5,
          height: 1080,
          width: 1920,
        },
      );
    });

    it('should update ingredient status to FAILED on processing error', async () => {
      const mockData = {
        error: 'Processing failed due to invalid format',
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        status: 'failed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      ingredientsService.patch.mockResolvedValue({
        _id: mockIngredientId,
        status: IngredientStatus.FAILED,
      });

      // Get the callback function passed to subscribe
      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      // Call the callback with mock data
      await subscribeCallback(mockData);
      await waitForAsyncHandler();

      expect(ingredientsService.patch).toHaveBeenCalledWith(
        mockData.ingredientId,
        {
          status: IngredientStatus.FAILED,
        },
      );
    });

    it('should handle completion with s3Key result', async () => {
      const mockData = {
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        result: {
          s3Key: 'ingredients/videos/507f1f77bcf86cd799439011',
        },
        status: 'completed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      ingredientsService.findOne.mockResolvedValue({
        _id: mockIngredientId,
        metadata: '507f1f77bcf86cd799439099',
      } as never);
      ingredientsService.patch.mockResolvedValue({
        _id: mockIngredientId,
        status: IngredientStatus.GENERATED,
      });

      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      await subscribeCallback(mockData);
      await waitForAsyncHandler();

      expect(ingredientsService.patch).toHaveBeenCalledWith(
        mockData.ingredientId,
        {
          s3Key: 'ingredients/videos/507f1f77bcf86cd799439011',
          status: IngredientStatus.GENERATED,
        },
      );
      expect(metadataService.patch).not.toHaveBeenCalled();
    });

    it('should handle completion without result data', async () => {
      const mockData = {
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        status: 'completed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      ingredientsService.patch.mockResolvedValue({
        _id: mockIngredientId,
        status: IngredientStatus.GENERATED,
      });

      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      await subscribeCallback(mockData);
      await waitForAsyncHandler();

      expect(ingredientsService.patch).toHaveBeenCalledWith(
        mockData.ingredientId,
        {
          status: IngredientStatus.GENERATED,
        },
      );
      expect(metadataService.patch).not.toHaveBeenCalled();
    });

    it('should persist top-level duration and dimensions metadata when present', async () => {
      const mockData = {
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        result: {
          dimensions: {
            height: 1920,
            width: 1080,
          },
          duration: 24.2,
        },
        status: 'completed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      ingredientsService.findOne.mockResolvedValue({
        _id: mockIngredientId,
        metadata: '507f1f77bcf86cd799439099',
      } as never);
      ingredientsService.patch.mockResolvedValue({
        _id: mockIngredientId,
        status: IngredientStatus.GENERATED,
      });

      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      await subscribeCallback(mockData);
      await waitForAsyncHandler();

      expect(metadataService.patch).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439099',
        {
          duration: 24.2,
          height: 1920,
          width: 1080,
        },
      );
    });

    it('should handle errors during ingredient update', async () => {
      const mockData = {
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        status: 'completed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      const error = new Error('Database update failed');
      ingredientsService.patch.mockRejectedValue(error);

      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      // The callback is fire-and-forget (void) — errors are caught internally
      expect(() => subscribeCallback(mockData)).not.toThrow();
      await waitForAsyncHandler();
      expect(ingredientsService.patch).toHaveBeenCalled();
    });

    it('should handle multiple completion events', async () => {
      const mockData1 = {
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        status: 'completed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      const mockData2 = {
        error: 'Processing error',
        ingredientId: 'test-object-id',
        organizationId: mockOrganizationId.toString(),
        status: 'failed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      ingredientsService.patch.mockResolvedValue({
        _id: mockIngredientId,
      });

      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      await subscribeCallback(mockData1);
      await subscribeCallback(mockData2);
      await waitForAsyncHandler();

      expect(ingredientsService.patch).toHaveBeenCalledTimes(2);
      expect(ingredientsService.patch).toHaveBeenNthCalledWith(
        1,
        mockData1.ingredientId,
        {
          status: IngredientStatus.GENERATED,
        },
      );
      expect(ingredientsService.patch).toHaveBeenNthCalledWith(
        2,
        mockData2.ingredientId,
        {
          status: IngredientStatus.FAILED,
        },
      );
    });
  });

  it('reconciles a completed editor render after a missed Redis event', async () => {
    const editorRender = {
      authProviderUserId: 'auth-user',
      ingredientId: mockIngredientId,
      jobId: 'job-123',
      metadataId: 'metadata-123',
      projectId: 'project-123',
      room: 'user-auth-user',
    };
    const output = {
      durationFrames: 300,
      durationSeconds: 10,
      fps: 30,
      height: 1080,
      rendererVersion: 'remotion@4.0.486',
      s3Key: 'videos/output.mp4',
      size: 4096,
      url: 'https://cdn.example.com/videos/output.mp4',
      width: 1920,
    };
    editorProjectsService.findRenderingProjects.mockResolvedValue([
      { id: 'project-123', organizationId: mockOrganizationId },
    ]);
    editorProjectsService.readRenderProvenance.mockReturnValue({
      job: editorRender,
      queuedAt: new Date().toISOString(),
    });
    fileQueueService.getJobStatus.mockResolvedValue({
      jobId: 'job-123',
      result: output,
      state: 'completed',
    });

    await service.reconcileEditorRenders();

    expect(editorProjectsService.markAsCompleted).toHaveBeenCalledWith(
      'project-123',
      mockIngredientId,
      output,
      'job-123',
    );
  });

  it('routes raw-cut events without treating clip results as ingredients', async () => {
    rawCutClipCompletionService.handleCompletion.mockResolvedValue(true);
    await service.onModuleInit();
    const subscribeCallback = (redisService.subscribe as vi.Mock).mock
      .calls[0][1];
    const event = {
      ingredientId: 'clip-result-1',
      organizationId: mockOrganizationId,
      result: {
        jobId: 'raw-cut-trim-clip-result-1',
        jobType: 'clip-trim',
      },
      status: 'completed',
      timestamp: new Date().toISOString(),
    };

    await subscribeCallback(event);

    expect(rawCutClipCompletionService.handleCompletion).toHaveBeenCalledWith(
      event,
    );
    expect(ingredientsService.patch).not.toHaveBeenCalled();
  });

  it('never falls through raw-cut events to ingredient persistence', async () => {
    rawCutClipCompletionService.handleCompletion.mockResolvedValue(false);

    await service.onModuleInit();
    const subscribeCallback = (redisService.subscribe as vi.Mock).mock
      .calls[0][1];
    await subscribeCallback({
      ingredientId: 'clip-result-1',
      organizationId: mockOrganizationId.toString(),
      result: {
        jobId: 'raw-cut-trim-clip-result-1',
      },
      status: Status.COMPLETED,
      timestamp: new Date().toISOString(),
    });

    expect(rawCutClipCompletionService.handleCompletion).toHaveBeenCalled();
    expect(ingredientsService.patch).not.toHaveBeenCalled();
  });

  it('polls raw-cut jobs during reconciliation', async () => {
    await service.reconcileRawCutClips();

    expect(cacheService.withLock).toHaveBeenCalledWith(
      'raw-cut-clip-reconciliation',
      expect.any(Function),
      300,
    );
    expect(
      rawCutClipCompletionService.reconcileActiveClips,
    ).toHaveBeenCalledTimes(1);
  });
});
