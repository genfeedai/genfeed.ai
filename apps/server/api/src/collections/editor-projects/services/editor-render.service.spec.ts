import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  EditorTrackType,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/enums';
import { EDITOR_RENDERER_VERSION } from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { UnprocessableEntityException } from '@nestjs/common';
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
    markAsCompleted: ReturnType<typeof vi.fn>;
    markAsFailed: ReturnType<typeof vi.fn>;
    markAsRendering: ReturnType<typeof vi.fn>;
  };
  let fileQueueService: {
    processVideo: ReturnType<typeof vi.fn>;
    waitForJob: ReturnType<typeof vi.fn>;
  };
  let ingredientsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let metadataService: {
    patch: ReturnType<typeof vi.fn>;
  };
  let sharedService: {
    saveDocuments: ReturnType<typeof vi.fn>;
  };
  let websocketService: {
    publishMediaFailed: ReturnType<typeof vi.fn>;
    publishVideoComplete: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    editorProjectsService = {
      findForRender: vi.fn().mockResolvedValue(makeProject()),
      markAsCompleted: vi.fn().mockResolvedValue(undefined),
      markAsFailed: vi.fn().mockResolvedValue(undefined),
      markAsRendering: vi.fn().mockResolvedValue(makeProject()),
    };
    fileQueueService = {
      processVideo: vi.fn().mockResolvedValue({ jobId: 'job-123' }),
      waitForJob: vi.fn().mockReturnValue(new Promise(() => undefined)),
    };
    ingredientsService = {
      findOne: vi.fn().mockImplementation(({ id }) =>
        Promise.resolve({
          brandId: 'brand-123',
          category:
            id === audioIngredientId
              ? IngredientCategory.MUSIC
              : IngredientCategory.VIDEO,
          id,
        }),
      ),
      patch: vi.fn().mockResolvedValue(undefined),
    };
    metadataService = {
      patch: vi.fn().mockResolvedValue(undefined),
    };
    sharedService = {
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: { id: 'output-video-123' },
        metadataData: { id: 'output-metadata-123' },
      }),
    };
    websocketService = {
      publishMediaFailed: vi.fn().mockResolvedValue(undefined),
      publishVideoComplete: vi.fn().mockResolvedValue(undefined),
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
        { provide: MetadataService, useValue: metadataService },
        { provide: SharedService, useValue: sharedService },
        { provide: NotificationsPublisherService, useValue: websocketService },
      ],
    }).compile();

    service = module.get(EditorRenderService);
  });

  afterEach(() => vi.clearAllMocks());

  it('queues the pinned renderer and persists its immutable input', async () => {
    const result = await service.render(projectId, organizationId, user);

    expect(result).toEqual({
      jobId: 'job-123',
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
        ingredientUrl: '',
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

    expect(ingredientsService.findOne).toHaveBeenCalledTimes(3);
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
    ingredientsService.findOne.mockResolvedValue(null);

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
    expect(editorProjectsService.markAsFailed).toHaveBeenCalledWith(projectId);
    expect(ingredientsService.patch).toHaveBeenCalledWith('output-video-123', {
      status: 'failed',
    });
  });

  it('marks the project and generated ingredient failed when rendering fails', async () => {
    fileQueueService.waitForJob.mockRejectedValue(new Error('render failed'));

    await service.render(projectId, organizationId, user);

    await vi.waitFor(() => {
      expect(editorProjectsService.markAsFailed).toHaveBeenCalledWith(
        projectId,
      );
    });
    expect(ingredientsService.patch).toHaveBeenCalledWith('output-video-123', {
      status: 'failed',
    });
    expect(websocketService.publishMediaFailed).toHaveBeenCalled();
  });

  it('persists renderer output metadata and completes the generated ingredient', async () => {
    const output = {
      durationFrames: 300,
      durationSeconds: 10,
      fps: 30,
      height: 1080,
      rendererVersion: EDITOR_RENDERER_VERSION,
      s3Key: 'videos/output-video-123.mp4',
      size: 4096,
      success: true,
      url: 'https://cdn.genfeed.ai/videos/output-video-123.mp4',
      width: 1920,
    };
    const persistedOutput = {
      durationFrames: 300,
      durationSeconds: 10,
      fps: 30,
      height: 1080,
      rendererVersion: EDITOR_RENDERER_VERSION,
      s3Key: 'videos/output-video-123.mp4',
      size: 4096,
      url: 'https://cdn.genfeed.ai/videos/output-video-123.mp4',
      width: 1920,
    };
    fileQueueService.waitForJob.mockResolvedValue(output);

    await service.render(projectId, organizationId, user);

    await vi.waitFor(() => {
      expect(editorProjectsService.markAsCompleted).toHaveBeenCalledWith(
        projectId,
        'output-video-123',
        persistedOutput,
      );
    });
    expect(metadataService.patch).toHaveBeenCalledWith('output-metadata-123', {
      duration: 10,
      height: 1080,
      label: 'Editor Render',
      size: 4096,
      width: 1920,
    });
    expect(ingredientsService.patch).toHaveBeenCalledWith('output-video-123', {
      status: 'generated',
    });
    expect(websocketService.publishVideoComplete).toHaveBeenCalled();
  });
});
