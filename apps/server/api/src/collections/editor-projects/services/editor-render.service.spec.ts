import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  EditorProjectStatus,
  EditorTrackType,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/enums';
import { EDITOR_RENDERER_VERSION } from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('EditorRenderService', () => {
  const organizationId = 'org-123';
  const projectId = 'project-123';
  const videoIngredientId = 'video-123';
  const audioIngredientId = 'music-123';
  const user = {
    id: 'auth-provider-user',
    publicMetadata: { user: 'database-user' },
  } as unknown as User;

  const makeClip = (
    id: string,
    ingredientId: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    durationFrames: 150,
    effects: [],
    id,
    ingredientId,
    ingredientUrl: `https://untrusted.example/${ingredientId}`,
    sourceEndFrame: 150,
    sourceStartFrame: 0,
    startFrame: 0,
    ...overrides,
  });

  const makeTrack = (
    type: EditorTrackType,
    clips = [makeClip(`${type}-clip`, videoIngredientId)],
    overrides: Record<string, unknown> = {},
  ) => ({
    clips,
    id: `${type}-track`,
    isLocked: false,
    isMuted: false,
    name: type,
    type,
    volume: 80,
    ...overrides,
  });

  const makeProject = (
    tracks = [makeTrack(EditorTrackType.VIDEO)],
    settings = {
      backgroundColor: '#000000',
      format: IngredientFormat.LANDSCAPE,
      fps: 30,
      height: 1080,
      width: 1920,
    },
  ) => ({
    id: projectId,
    settings,
    totalDurationFrames: 300,
    tracks,
  });

  let service: EditorRenderService;
  let editorProjectsService: {
    findForRender: ReturnType<typeof vi.fn>;
    attachRenderJob: ReturnType<typeof vi.fn>;
    markAsFailed: ReturnType<typeof vi.fn>;
    markAsCancelled: ReturnType<typeof vi.fn>;
    markAsRendering: ReturnType<typeof vi.fn>;
    readRenderProvenance: ReturnType<typeof vi.fn>;
    readStatus: ReturnType<typeof vi.fn>;
  };
  let fileQueueService: {
    cancelEditorRender: ReturnType<typeof vi.fn>;
    processVideo: ReturnType<typeof vi.fn>;
  };
  let ingredientsService: {
    findAll: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let sharedService: {
    saveDocuments: ReturnType<typeof vi.fn>;
  };
  let notificationsPublisher: {
    publishMediaFailed: ReturnType<typeof vi.fn>;
  };
  let cacheInvalidationService: {
    invalidate: ReturnType<typeof vi.fn>;
    invalidateByTags: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    editorProjectsService = {
      attachRenderJob: vi.fn().mockResolvedValue(makeProject()),
      findForRender: vi.fn().mockResolvedValue(makeProject()),
      markAsFailed: vi.fn().mockResolvedValue(undefined),
      markAsCancelled: vi.fn().mockResolvedValue(undefined),
      markAsRendering: vi.fn().mockResolvedValue(makeProject()),
      readRenderProvenance: vi.fn(),
      readStatus: vi.fn(),
    };
    fileQueueService = {
      cancelEditorRender: vi.fn().mockResolvedValue({
        jobId: 'job-123',
        requestedAt: new Date().toISOString(),
        status: 'cancellation-requested',
      }),
      processVideo: vi
        .fn()
        .mockImplementation(({ id }) => Promise.resolve({ jobId: id })),
    };
    ingredientsService = {
      findAll: vi.fn().mockImplementation(({ where }) => {
        const ids = where._id.in as string[];
        return Promise.resolve({
          docs: ids.map((id) => ({
            brandId: 'brand-123',
            category:
              id === audioIngredientId
                ? IngredientCategory.MUSIC
                : IngredientCategory.VIDEO,
            id,
          })),
        });
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };
    sharedService = {
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: { id: 'output-video-123' },
        metadataData: { id: 'output-metadata-123' },
      }),
    };
    notificationsPublisher = {
      publishMediaFailed: vi.fn().mockResolvedValue(undefined),
    };
    cacheInvalidationService = {
      invalidate: vi.fn().mockResolvedValue(undefined),
      invalidateByTags: vi.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EditorRenderService,
        {
          provide: ConfigService,
          useValue: { ingredientsEndpoint: 'https://cdn.genfeed.ai' },
        },
        { provide: EditorProjectsService, useValue: editorProjectsService },
        { provide: FileQueueService, useValue: fileQueueService },
        { provide: IngredientsService, useValue: ingredientsService },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: notificationsPublisher,
        },
        {
          provide: CacheInvalidationService,
          useValue: cacheInvalidationService,
        },
        { provide: SharedService, useValue: sharedService },
      ],
    }).compile();

    service = module.get(EditorRenderService);
  });

  afterEach(() => vi.clearAllMocks());

  it('queues the pinned renderer and persists its immutable input', async () => {
    const result = await service.render(projectId, organizationId, user);

    expect(result).toEqual({
      jobId: expect.any(String),
      projectId,
      status: 'rendering',
    });
    expect(editorProjectsService.markAsRendering).toHaveBeenCalledWith(
      projectId,
      organizationId,
      expect.objectContaining({
        assetManifest: expect.any(Array),
        queuedAt: expect.any(String),
        rendererVersion: EDITOR_RENDERER_VERSION,
        snapshot: expect.objectContaining({ projectId }),
      }),
    );
    expect(fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          rendererVersion: EDITOR_RENDERER_VERSION,
        }),
        type: 'render-editor-composition',
      }),
    );
  });

  it('queues multiple video, text, and audio layers with trusted asset URLs', async () => {
    const videoTrack = makeTrack(EditorTrackType.VIDEO, [
      makeClip('video-1', videoIngredientId, { durationFrames: 150 }),
      makeClip('video-2', 'video-456', {
        durationFrames: 150,
        startFrame: 150,
      }),
    ]);
    const textTrack = makeTrack(EditorTrackType.TEXT, [
      makeClip('text-1', '', {
        ingredientId: 'untrusted-text-asset',
        ingredientUrl: 'https://untrusted.example/text-asset',
        textOverlay: {
          color: '#ffffff',
          fontSize: 48,
          position: { x: 50, y: 80 },
          text: 'Launch',
        },
      }),
    ]);
    const audioTrack = makeTrack(EditorTrackType.AUDIO, [
      makeClip('audio-1', audioIngredientId),
    ]);
    editorProjectsService.findForRender.mockResolvedValue(
      makeProject([videoTrack, textTrack, audioTrack]),
    );

    await service.render(projectId, organizationId, user);

    expect(ingredientsService.findAll).toHaveBeenCalledTimes(1);
    expect(fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          assetManifest: expect.arrayContaining([
            expect.objectContaining({
              ingredientUrl: 'https://cdn.genfeed.ai/videos/video-123',
            }),
            expect.objectContaining({
              ingredientUrl: 'https://cdn.genfeed.ai/musics/music-123',
            }),
          ]),
          snapshot: expect.objectContaining({
            tracks: expect.arrayContaining([
              expect.objectContaining({
                clips: expect.arrayContaining([
                  expect.objectContaining({
                    ingredientUrl: 'https://cdn.genfeed.ai/videos/video-123',
                  }),
                ]),
              }),
              expect.objectContaining({
                clips: [
                  expect.objectContaining({
                    id: 'text-1',
                    ingredientId: '',
                    ingredientUrl: '',
                    textOverlay: expect.objectContaining({ text: 'Launch' }),
                  }),
                ],
                type: EditorTrackType.TEXT,
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('rejects malformed export settings before render side effects', async () => {
    editorProjectsService.findForRender.mockResolvedValue(
      makeProject([makeTrack(EditorTrackType.VIDEO)], {
        backgroundColor: '#000000',
        format: IngredientFormat.LANDSCAPE,
        fps: 30,
        height: 1080,
        width: 0,
      }),
    );

    await expect(
      service.render(projectId, organizationId, user),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(editorProjectsService.markAsRendering).not.toHaveBeenCalled();
    expect(fileQueueService.processVideo).not.toHaveBeenCalled();
  });

  it('rejects an asset that is not owned by the organization', async () => {
    ingredientsService.findAll.mockResolvedValue({ docs: [] });

    await expect(
      service.render(projectId, organizationId, user),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(editorProjectsService.markAsRendering).not.toHaveBeenCalled();
  });

  it('marks the project failed when queue submission fails', async () => {
    fileQueueService.processVideo.mockRejectedValue(new Error('queue offline'));

    await expect(
      service.render(projectId, organizationId, user),
    ).rejects.toThrow('queue offline');
    expect(editorProjectsService.markAsFailed).toHaveBeenCalledWith(
      projectId,
      expect.any(String),
    );
    expect(ingredientsService.patch).toHaveBeenCalledWith('output-video-123', {
      status: 'failed',
    });
    expect(cacheInvalidationService.invalidate).toHaveBeenCalledWith(
      CACHE_PATTERNS.EDITOR_PROJECTS_LIST(organizationId),
      CACHE_PATTERNS.EDITOR_PROJECTS_SINGLE(projectId),
      CACHE_PATTERNS.INGREDIENTS_LIST(organizationId),
      CACHE_PATTERNS.INGREDIENTS_SINGLE('output-video-123'),
    );
    expect(cacheInvalidationService.invalidateByTags).toHaveBeenCalledWith([
      CACHE_TAGS.EDITOR_PROJECTS,
      CACHE_TAGS.INGREDIENTS,
    ]);
  });

  it('cancels the owning render job and records a retry-safe terminal state', async () => {
    editorProjectsService.readRenderProvenance.mockReturnValue({
      job: {
        authProviderUserId: 'auth-provider-user',
        ingredientId: 'output-video-123',
        jobId: 'job-123',
        metadataId: 'output-metadata-123',
        projectId,
        room: 'user-room',
      },
    });

    await expect(service.cancel(projectId, organizationId)).resolves.toEqual({
      jobId: 'job-123',
      projectId,
      status: 'cancelled',
    });
    expect(fileQueueService.cancelEditorRender).toHaveBeenCalledWith('job-123');
    expect(editorProjectsService.markAsCancelled).toHaveBeenCalledWith(
      projectId,
      'job-123',
      expect.objectContaining({ reason: 'cancelled' }),
    );
    expect(ingredientsService.patch).toHaveBeenCalledWith('output-video-123', {
      status: 'failed',
    });
  });

  it('does not repeat cancellation side effects after another writer wins', async () => {
    editorProjectsService.readRenderProvenance.mockReturnValue({
      job: {
        authProviderUserId: 'auth-provider-user',
        ingredientId: 'output-video-123',
        jobId: 'job-123',
        metadataId: 'output-metadata-123',
        projectId,
        room: 'user-room',
      },
    });
    editorProjectsService.markAsCancelled.mockRejectedValueOnce(
      new ConflictException('Render job no longer owns this project'),
    );
    editorProjectsService.readStatus.mockReturnValue(
      EditorProjectStatus.CANCELLED,
    );

    await expect(service.cancel(projectId, organizationId)).resolves.toEqual({
      jobId: 'job-123',
      projectId,
      status: 'cancelled',
    });

    expect(ingredientsService.patch).not.toHaveBeenCalled();
    expect(notificationsPublisher.publishMediaFailed).not.toHaveBeenCalled();
    expect(cacheInvalidationService.invalidate).toHaveBeenCalled();
  });
});
