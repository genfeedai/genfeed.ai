vi.mock('node:fs', () => ({
  default: { unlinkSync: vi.fn() },
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { EditorTrackType, IngredientFormat } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { UnprocessableEntityException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';

describe('EditorRenderService', () => {
  let service: EditorRenderService;

  let editorProjectsService: {
    findForRender: ReturnType<typeof vi.fn>;
    markAsRendering: ReturnType<typeof vi.fn>;
    markAsFailed: ReturnType<typeof vi.fn>;
    markAsCompleted: ReturnType<typeof vi.fn>;
  };
  let fileQueueService: {
    processVideo: ReturnType<typeof vi.fn>;
    waitForJob: ReturnType<typeof vi.fn>;
  };
  let filesClientService: { uploadToS3: ReturnType<typeof vi.fn> };
  let ingredientsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let metadataService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let sharedService: { saveDocuments: ReturnType<typeof vi.fn> };
  let websocketService: {
    publishVideoComplete: ReturnType<typeof vi.fn>;
    publishMediaFailed: ReturnType<typeof vi.fn>;
  };
  let logger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  const orgId = 'test-object-id';
  const projectId = 'test-object-id';
  const videoIngredientId = 'test-object-id';

  const mockUser = {
    id: 'authProvider-user-1',
    publicMetadata: { user: 'db-user-id-1' },
  } as unknown as User;

  const makeTrack = (type: EditorTrackType, clipOverrides = {}) => ({
    clips: [
      {
        durationFrames: 300,
        effects: [],
        id: `${type}-clip`,
        ingredientId: videoIngredientId,
        ingredientUrl: `https://cdn.genfeed.ai/${type}`,
        sourceEndFrame: 300,
        sourceStartFrame: 0,
        startFrame: 0,
        textOverlay: null,
        ...clipOverrides,
      },
    ],
    id: `${type}-track`,
    isLocked: false,
    isMuted: false,
    name: type,
    type,
    volume: 100,
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

  beforeEach(async () => {
    editorProjectsService = {
      findForRender: vi.fn().mockResolvedValue(makeProject()),
      markAsCompleted: vi.fn().mockResolvedValue(undefined),
      markAsFailed: vi.fn().mockResolvedValue(undefined),
      markAsRendering: vi.fn().mockResolvedValue(makeProject()),
    };
    fileQueueService = {
      processVideo: vi.fn().mockResolvedValue({ jobId: 'job-abc' }),
      waitForJob: vi.fn().mockResolvedValue({ outputPath: '/tmp/output.mp4' }),
    };
    filesClientService = {
      uploadToS3: vi.fn().mockResolvedValue({
        duration: 10,
        height: 1080,
        size: 5000,
        width: 1920,
      }),
    };
    ingredientsService = {
      findOne: vi.fn().mockResolvedValue({
        id: videoIngredientId,
        brand: null,
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };
    metadataService = {
      findOne: vi
        .fn()
        .mockResolvedValue({ duration: 10, height: 1080, width: 1920 }),
      patch: vi.fn().mockResolvedValue(undefined),
    };
    sharedService = {
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: { id: 'test-object-id' },
        metadataData: { id: 'test-object-id' },
      }),
    };
    websocketService = {
      publishMediaFailed: vi.fn().mockResolvedValue(undefined),
      publishVideoComplete: vi.fn().mockResolvedValue(undefined),
    };
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EditorRenderService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
            ingredientsEndpoint: 'https://cdn.genfeed.ai',
          },
        },
        { provide: EditorProjectsService, useValue: editorProjectsService },
        { provide: FileQueueService, useValue: fileQueueService },
        { provide: FilesClientService, useValue: filesClientService },
        { provide: IngredientsService, useValue: ingredientsService },
        { provide: LoggerService, useValue: logger },
        { provide: MetadataService, useValue: metadataService },
        { provide: SharedService, useValue: sharedService },
        { provide: NotificationsPublisherService, useValue: websocketService },
      ],
    }).compile();

    service = module.get<EditorRenderService>(EditorRenderService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('render', () => {
    it('should return rendering status with jobId on success', async () => {
      editorProjectsService.markAsRendering.mockResolvedValue(makeProject());

      const result = await service.render(projectId, orgId, mockUser);

      expect(result.status).toBe('rendering');
      expect(result.jobId).toBe('job-abc');
      expect(result.projectId).toBe(projectId);
    });

    it('should call markAsRendering with id and orgId', async () => {
      await service.render(projectId, orgId, mockUser);

      expect(editorProjectsService.markAsRendering).toHaveBeenCalledWith(
        projectId,
        orgId,
      );
    });

    it('should throw UnprocessableEntityException when no video track', async () => {
      editorProjectsService.findForRender.mockResolvedValue(makeProject([]));

      await expect(service.render(projectId, orgId, mockUser)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(editorProjectsService.markAsRendering).not.toHaveBeenCalled();
      expect(sharedService.saveDocuments).not.toHaveBeenCalled();
      expect(fileQueueService.processVideo).not.toHaveBeenCalled();
    });

    it('should reject malformed export settings before render side effects', async () => {
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
        service.render(projectId, orgId, mockUser),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'editor_export_contract_invalid',
          violations: expect.arrayContaining([
            expect.objectContaining({ path: 'settings.width' }),
          ]),
        }),
      });
      expect(editorProjectsService.markAsRendering).not.toHaveBeenCalled();
      expect(sharedService.saveDocuments).not.toHaveBeenCalled();
      expect(fileQueueService.processVideo).not.toHaveBeenCalled();
    });

    it('should throw UnprocessableEntityException when more than one video track', async () => {
      editorProjectsService.findForRender.mockResolvedValue(
        makeProject([
          makeTrack(EditorTrackType.VIDEO),
          {
            ...makeTrack(EditorTrackType.VIDEO),
            id: 'second-video-track',
            clips: [
              {
                ...makeTrack(EditorTrackType.VIDEO).clips[0],
                id: 'second-video-clip',
              },
            ],
          },
        ]),
      );

      await expect(service.render(projectId, orgId, mockUser)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(editorProjectsService.markAsRendering).not.toHaveBeenCalled();
    });

    it('should throw UnprocessableEntityException when video track has no clips', async () => {
      editorProjectsService.findForRender.mockResolvedValue(
        makeProject([{ ...makeTrack(EditorTrackType.VIDEO), clips: [] }]),
      );

      await expect(service.render(projectId, orgId, mockUser)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should throw UnprocessableEntityException when video track has multiple clips', async () => {
      const multiClipTrack = {
        clips: [
          {
            ...makeTrack(EditorTrackType.VIDEO).clips[0],
            durationFrames: 150,
            id: 'video-clip-1',
            sourceEndFrame: 150,
          },
          {
            ...makeTrack(EditorTrackType.VIDEO).clips[0],
            durationFrames: 150,
            id: 'video-clip-2',
            ingredientId: videoIngredientId,
            sourceEndFrame: 300,
            sourceStartFrame: 150,
            startFrame: 150,
          },
        ],
        id: 'multi-clip-track',
        isLocked: false,
        isMuted: false,
        name: 'Video',
        type: EditorTrackType.VIDEO,
        volume: 100,
      };
      editorProjectsService.findForRender.mockResolvedValue(
        makeProject([multiClipTrack]),
      );

      await expect(service.render(projectId, orgId, mockUser)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should reject contract-valid audio tracks that the current renderer cannot consume', async () => {
      editorProjectsService.findForRender.mockResolvedValue(
        makeProject([
          makeTrack(EditorTrackType.VIDEO),
          {
            ...makeTrack(EditorTrackType.AUDIO),
            id: 'audio-track',
            clips: [
              {
                ...makeTrack(EditorTrackType.AUDIO).clips[0],
                id: 'audio-clip',
              },
            ],
          },
        ]),
      );

      await expect(service.render(projectId, orgId, mockUser)).rejects.toThrow(
        'Audio tracks require the multi-track renderer',
      );
      expect(editorProjectsService.markAsRendering).not.toHaveBeenCalled();
      expect(sharedService.saveDocuments).not.toHaveBeenCalled();
      expect(fileQueueService.processVideo).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when source video not found', async () => {
      ingredientsService.findOne.mockResolvedValue(null);

      await expect(service.render(projectId, orgId, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should call markAsFailed when post-transition step throws', async () => {
      ingredientsService.findOne.mockRejectedValue(new Error('DB error'));

      await expect(service.render(projectId, orgId, mockUser)).rejects.toThrow(
        'DB error',
      );
      expect(editorProjectsService.markAsFailed).toHaveBeenCalledWith(
        projectId,
      );
    });

    it('should pass text overlay job type when text track present', async () => {
      const textTrack = makeTrack(EditorTrackType.TEXT, {
        ingredientId: '',
        ingredientUrl: '',
        textOverlay: {
          color: '#ffffff',
          fontSize: 32,
          position: { x: 50, y: 80 },
          text: 'Hello World',
        },
      });
      editorProjectsService.findForRender.mockResolvedValue(
        makeProject([makeTrack(EditorTrackType.VIDEO), textTrack]),
      );

      await service.render(projectId, orgId, mockUser);

      expect(fileQueueService.processVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ position: 'bottom' }),
          type: 'add-text-overlay',
        }),
      );
    });

    it('should pass trim-video job type when no text overlay and video is trimmed', async () => {
      const trimmedTrack = makeTrack(EditorTrackType.VIDEO, {
        durationFrames: 120,
        sourceEndFrame: 150,
        sourceStartFrame: 30,
      });
      editorProjectsService.findForRender.mockResolvedValue(
        makeProject([trimmedTrack]),
      );

      await service.render(projectId, orgId, mockUser);

      expect(fileQueueService.processVideo).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'trim-video' }),
      );
    });
  });
});
