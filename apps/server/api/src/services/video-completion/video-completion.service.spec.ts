import { RawCutClipCompletionService } from '@api/collections/clipper-projects/services/raw-cut-clip-completion.service';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { INGREDIENT_PROCESSING_TIMEOUT_ERROR } from '@api/collections/ingredients/constants/processing-timeout.constants';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CacheService } from '@api/services/cache/cache.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  type VideoCompletionEvent,
  VideoCompletionService,
} from '@api/services/video-completion/video-completion.service';
import { GenerationEventWebhookService } from '@api/services/webhook-client/generation-event-webhook.service';
import { createIngredientDocumentFixture } from '@api-test/fixtures/ingredient-document.fixture';
import { ingredientRowWorld } from '@api-test/fixtures/ingredient-row.world';
import { delegateFindOneSelect } from '@api-test/mocks/service.mocks';
import { IngredientStatus, Status } from '@genfeedai/contracts';
import { EDITOR_RENDERER_VERSION } from '@genfeedai/contracts/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('VideoCompletionService', () => {
  let service: VideoCompletionService;
  let ingredientsService: vi.Mocked<IngredientsService>;
  let metadataService: vi.Mocked<MetadataService>;
  let editorProjectsService: {
    findRenderingProjects: ReturnType<typeof vi.fn>;
    markAsCancelled: ReturnType<typeof vi.fn>;
    markAsCompleted: ReturnType<typeof vi.fn>;
    markAsFailed: ReturnType<typeof vi.fn>;
    readRenderProvenance: ReturnType<typeof vi.fn>;
  };
  let fileQueueService: {
    cancelEditorRender: ReturnType<typeof vi.fn>;
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
  let generationEventWebhookService: {
    emitGenerationCompleted: ReturnType<typeof vi.fn>;
    emitGenerationFailed: ReturnType<typeof vi.fn>;
  };
  let cacheService: {
    withLock: ReturnType<typeof vi.fn>;
  };

  const mockIngredientId = testId('ingredient');
  const mockUserId = testId('user');
  const mockOrganizationId = testId('org');
  const mockMetadataId = testId('metadata');

  const ingredientIdentity = {
    id: mockIngredientId.toString(),
    isDeleted: false,
    organizationId: mockOrganizationId.toString(),
  };
  let ingredientRow: Record<string, unknown>;

  beforeEach(async () => {
    ingredientRow = {
      ...ingredientIdentity,
      generationError: null,
      status: IngredientStatus.PROCESSING,
    };
    editorProjectsService = {
      findRenderingProjects: vi.fn().mockResolvedValue([]),
      markAsCancelled: vi.fn().mockResolvedValue(undefined),
      markAsCompleted: vi.fn().mockResolvedValue(undefined),
      markAsFailed: vi.fn().mockResolvedValue(undefined),
      readRenderProvenance: vi.fn(),
    };
    fileQueueService = {
      cancelEditorRender: vi.fn().mockResolvedValue(undefined),
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
    generationEventWebhookService = {
      emitGenerationCompleted: vi.fn().mockResolvedValue(undefined),
      emitGenerationFailed: vi.fn().mockResolvedValue(undefined),
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
          provide: GenerationEventWebhookService,
          useValue: generationEventWebhookService,
        },
        {
          provide: IngredientsService,
          useValue: {
            findOne: vi.fn(),
            findOneSelect: delegateFindOneSelect(),
            patch: vi.fn(ingredientRowWorld(ingredientRow).patch),
            patchAll: vi.fn(ingredientRowWorld(ingredientRow).patchAll),
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
    ingredientsService = module.get(IngredientsService);
    metadataService = module.get(MetadataService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleVideoCompletion', () => {
    it('atomically completes an editor render from its durable event', async () => {
      const editorRender = {
        userId: 'auth-user',
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
        rendererVersion: EDITOR_RENDERER_VERSION,
        s3Key: 'videos/output.mp4',
        size: 4096,
        url: 'https://cdn.example.com/videos/output.mp4',
        width: 1920,
      };

      await service.handleVideoCompletion({
        editorRender,
        ingredientId: mockIngredientId,
        organizationId: mockOrganizationId,
        result: output,
        status: Status.COMPLETED,
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

    it('marks a late output failed when cancellation wins the project CAS, and reports the lost race', async () => {
      const editorRender = {
        userId: 'auth-user',
        ingredientId: mockIngredientId,
        jobId: 'job-123',
        metadataId: 'metadata-123',
        projectId: 'project-123',
        room: 'user-auth-user',
      };
      editorProjectsService.markAsCompleted.mockRejectedValueOnce(
        new ConflictException('Render job no longer owns this project'),
      );

      await expect(
        service.handleVideoCompletion({
          editorRender,
          ingredientId: mockIngredientId,
          organizationId: mockOrganizationId,
          result: {
            durationFrames: 300,
            durationSeconds: 10,
            fps: 30,
            height: 1080,
            rendererVersion: EDITOR_RENDERER_VERSION,
            s3Key: 'videos/output.mp4',
            size: 4096,
            url: 'https://cdn.example.com/videos/output.mp4',
            width: 1920,
          },
          status: Status.COMPLETED,
          timestamp: new Date().toISOString(),
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(ingredientsService.patch).toHaveBeenLastCalledWith(
        mockIngredientId,
        { status: IngredientStatus.FAILED },
      );
      expect(
        notificationsPublisher.publishVideoComplete,
      ).not.toHaveBeenCalled();
    });

    it('rejects when completion persistence fails transiently, so the queue retries without failing the output', async () => {
      const editorRender = {
        userId: 'auth-user',
        ingredientId: mockIngredientId,
        jobId: 'job-123',
        metadataId: 'metadata-123',
        projectId: 'project-123',
        room: 'user-auth-user',
      };
      editorProjectsService.markAsCompleted.mockRejectedValueOnce(
        new Error('database unavailable'),
      );

      await expect(
        service.handleVideoCompletion({
          editorRender,
          ingredientId: mockIngredientId,
          organizationId: mockOrganizationId,
          result: {
            durationFrames: 300,
            durationSeconds: 10,
            fps: 30,
            height: 1080,
            rendererVersion: EDITOR_RENDERER_VERSION,
            s3Key: 'videos/output.mp4',
            size: 4096,
            url: 'https://cdn.example.com/videos/output.mp4',
            width: 1920,
          },
          status: Status.COMPLETED,
          timestamp: new Date().toISOString(),
        }),
      ).rejects.toThrow('database unavailable');

      expect(ingredientsService.patch).not.toHaveBeenCalledWith(
        mockIngredientId,
        { status: IngredientStatus.FAILED },
      );
      expect(
        notificationsPublisher.publishVideoComplete,
      ).not.toHaveBeenCalled();
    });

    it('does not duplicate terminal side effects after another writer wins, and reports the lost race', async () => {
      editorProjectsService.markAsFailed.mockRejectedValueOnce(
        new ConflictException('Render job no longer owns this project'),
      );

      await expect(
        service.handleVideoCompletion({
          editorRender: {
            userId: 'auth-user',
            ingredientId: mockIngredientId,
            jobId: 'job-123',
            metadataId: 'metadata-123',
            projectId: 'project-123',
            room: 'user-auth-user',
          },
          ingredientId: mockIngredientId,
          organizationId: mockOrganizationId,
          status: Status.FAILED,
          terminalReason: 'renderer_failed',
          timestamp: new Date().toISOString(),
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(ingredientsService.patch).not.toHaveBeenCalled();
      expect(notificationsPublisher.publishMediaFailed).not.toHaveBeenCalled();
    });

    async function deliver(
      event: Pick<VideoCompletionEvent, 'status'> &
        Partial<VideoCompletionEvent>,
    ): Promise<void> {
      await service.handleVideoCompletion({
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
        ...event,
      });
    }

    const s3Key = 'ingredients/videos/resized.mp4';

    it.each([
      [
        'a processing resize',
        { generationError: null, status: IngredientStatus.PROCESSING },
        { generationError: null, s3Key, status: IngredientStatus.GENERATED },
        true,
      ],
      [
        'a resize the queuing request already settled',
        { generationError: null, status: IngredientStatus.GENERATED },
        { generationError: null, s3Key, status: IngredientStatus.GENERATED },
        true,
      ],
      [
        'a resize the processing-timeout cron failed',
        {
          generationError: INGREDIENT_PROCESSING_TIMEOUT_ERROR,
          status: IngredientStatus.FAILED,
        },
        { generationError: null, s3Key, status: IngredientStatus.GENERATED },
        true,
      ],
      [
        'a resize the user cancelled (#9735)',
        {
          generationError: 'Cancelled by user',
          status: IngredientStatus.FAILED,
        },
        {
          generationError: 'Cancelled by user',
          status: IngredientStatus.FAILED,
        },
        false,
      ],
    ])(
      'settles a completion event for %s',
      async (_label, before, after, isCompletionReported) => {
        Object.assign(ingredientRow, before);

        await deliver({ result: { s3Key }, status: Status.COMPLETED });

        expect(ingredientRow).toEqual({ ...ingredientIdentity, ...after });
        expect(
          generationEventWebhookService.emitGenerationCompleted.mock.calls,
        ).toEqual(
          isCompletionReported
            ? [
                [
                  {
                    generationId: mockIngredientId.toString(),
                    kind: 'video',
                    organizationId: mockOrganizationId.toString(),
                    output: { mimeType: null, storageKey: s3Key, url: null },
                  },
                ],
              ]
            : [],
        );
      },
    );

    it.each([
      [
        'a processing resize',
        IngredientStatus.PROCESSING,
        IngredientStatus.FAILED,
        1,
      ],
      [
        'a resize that already completed',
        IngredientStatus.GENERATED,
        IngredientStatus.GENERATED,
        0,
      ],
    ])(
      'settles a failure event for %s',
      async (_label, before, after, failureReports) => {
        ingredientRow.status = before;

        await deliver({ error: 'Invalid format', status: Status.FAILED });

        expect(ingredientRow.status).toBe(after);
        expect(
          generationEventWebhookService.emitGenerationFailed,
        ).toHaveBeenCalledTimes(failureReports);
      },
    );

    it('reports the failure reason for a failed resize', async () => {
      await deliver({ error: 'Invalid format', status: Status.FAILED });

      expect(
        generationEventWebhookService.emitGenerationFailed,
      ).toHaveBeenCalledWith({
        errorMessage: 'Invalid format',
        generationId: mockIngredientId.toString(),
        kind: 'video',
        organizationId: mockOrganizationId.toString(),
      });
    });

    it('marks a completed resize generated without an output key', async () => {
      await deliver({ status: Status.COMPLETED });

      expect(ingredientRow).toEqual({
        ...ingredientIdentity,
        generationError: null,
        status: IngredientStatus.GENERATED,
      });
      expect(metadataService.patch).not.toHaveBeenCalled();
    });

    it.each([
      [
        'nested metadata',
        { metadata: { duration: 10.5, height: 1080, width: 1920 }, s3Key },
        { duration: 10.5, height: 1080, width: 1920 },
      ],
      [
        'top-level duration and dimensions',
        { dimensions: { height: 1920, width: 1080 }, duration: 24.2 },
        { duration: 24.2, height: 1920, width: 1080 },
      ],
    ])(
      'persists %s from a completed resize',
      async (_label, result, metadata) => {
        ingredientsService.findOne.mockResolvedValue(
          createIngredientDocumentFixture({
            id: mockIngredientId,
            metadataId: mockMetadataId,
          }),
        );

        await deliver({ result, status: Status.COMPLETED });

        expect(metadataService.patch).toHaveBeenCalledWith(
          mockMetadataId,
          metadata,
        );
      },
    );

    it('does not persist metadata when the result carries none', async () => {
      await deliver({ result: { s3Key }, status: Status.COMPLETED });

      expect(metadataService.patch).not.toHaveBeenCalled();
    });

    it('rejects a failed ingredient write so the queue retries it', async () => {
      ingredientsService.patchAll.mockRejectedValue(
        new Error('Database update failed'),
      );

      await expect(deliver({ status: Status.COMPLETED })).rejects.toThrow(
        'Database update failed',
      );
      expect(ingredientRow.status).toBe(IngredientStatus.PROCESSING);
    });
  });

  it('reconciles a completed editor render after a missed completion event', async () => {
    const editorRender = {
      ingredientId: mockIngredientId,
      jobId: 'job-123',
      metadataId: 'metadata-123',
      projectId: 'project-123',
      room: 'user-auth-user',
      userId: 'auth-user',
    };
    const output = {
      durationFrames: 300,
      durationSeconds: 10,
      fps: 30,
      height: 1080,
      rendererVersion: EDITOR_RENDERER_VERSION,
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
    const event: VideoCompletionEvent = {
      ingredientId: 'clipper-result-1',
      organizationId: mockOrganizationId,
      result: {
        jobId: 'raw-cut-trim-clipper-result-1',
        jobType: 'clip-trim',
      },
      status: Status.COMPLETED,
      timestamp: new Date().toISOString(),
    };

    await service.handleVideoCompletion(event);

    expect(rawCutClipCompletionService.handleCompletion).toHaveBeenCalledWith(
      event,
    );
    expect(ingredientsService.patch).not.toHaveBeenCalled();
  });

  it('never falls through raw-cut events to ingredient persistence', async () => {
    rawCutClipCompletionService.handleCompletion.mockResolvedValue(false);

    await service.handleVideoCompletion({
      ingredientId: 'clipper-result-1',
      organizationId: mockOrganizationId.toString(),
      result: {
        jobId: 'raw-cut-trim-clipper-result-1',
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

  it('cancels and terminally classifies a stale active render', async () => {
    const editorRender = {
      ingredientId: mockIngredientId,
      jobId: 'job-123',
      metadataId: 'metadata-123',
      projectId: 'project-123',
      room: 'user-auth-user',
      userId: 'auth-user',
    };
    editorProjectsService.findRenderingProjects.mockResolvedValue([
      { id: 'project-123', organizationId: mockOrganizationId },
    ]);
    editorProjectsService.readRenderProvenance.mockReturnValue({
      job: editorRender,
      queuedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    fileQueueService.getJobStatus.mockResolvedValue({
      jobId: 'job-123',
      state: 'active',
    });

    await service.reconcileEditorRenders();

    expect(fileQueueService.cancelEditorRender).toHaveBeenCalledWith('job-123');
    expect(editorProjectsService.markAsFailed).toHaveBeenCalledWith(
      'project-123',
      'job-123',
      expect.objectContaining({ reason: 'timed_out' }),
    );
  });

  it('leaves a stale render retryable when cancellation loses a race', async () => {
    const editorRender = {
      ingredientId: mockIngredientId,
      jobId: 'job-123',
      metadataId: 'metadata-123',
      projectId: 'project-123',
      room: 'user-auth-user',
      userId: 'auth-user',
    };
    editorProjectsService.findRenderingProjects.mockResolvedValue([
      { id: 'project-123', organizationId: mockOrganizationId },
    ]);
    editorProjectsService.readRenderProvenance.mockReturnValue({
      job: editorRender,
      queuedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    fileQueueService.getJobStatus.mockResolvedValue({
      jobId: 'job-123',
      state: 'active',
    });
    fileQueueService.cancelEditorRender.mockRejectedValueOnce(
      new ConflictException('Editor render job is already terminal'),
    );

    await service.reconcileEditorRenders();

    expect(editorProjectsService.markAsFailed).not.toHaveBeenCalled();
    expect(notificationsPublisher.publishMediaFailed).not.toHaveBeenCalled();
  });
});
