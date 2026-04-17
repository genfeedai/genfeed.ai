vi.mock('node:fs', () => ({
  default: { unlinkSync: vi.fn() },
}));

import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ConfigService } from '@api/config/config.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import { EditorTrackType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('EditorRenderService', () => {
  let service: EditorRenderService;

  let editorProjectsService: {
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

  const orgId = new Types.ObjectId().toString();
  const projectId = new Types.ObjectId().toString();
  const videoIngredientId = new Types.ObjectId().toString();

  const mockUser = {
    id: 'clerk-user-1',
    publicMetadata: { user: 'db-user-id-1' },
  } as unknown as User;

  const makeTrack = (type: EditorTrackType, clipOverrides = {}) => ({
    clips: [
      {
        ingredientId: videoIngredientId,
        sourceEndFrame: 300,
        sourceStartFrame: 0,
        textOverlay: null,
        ...clipOverrides,
      },
    ],
    type,
  });

  const makeProject = (
    tracks = [makeTrack(EditorTrackType.VIDEO)],
    settings = { fps: 30 },
  ) => ({
    _id: new Types.ObjectId(projectId),
    settings,
    tracks,
  });

  beforeEach(async () => {
    editorProjectsService = {
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
        _id: new Types.ObjectId(videoIngredientId),
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
        ingredientData: { _id: new Types.ObjectId() },
        metadataData: { _id: new Types.ObjectId() },
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
      editorProjectsService.markAsRendering.mockResolvedValue(makeProject([]));

      await expect(service.render(projectId, orgId, mockUser)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should throw UnprocessableEntityException when more than one video track', async () => {
      editorProjectsService.markAsRendering.mockResolvedValue(
        makeProject([
          makeTrack(EditorTrackType.VIDEO),
          makeTrack(EditorTrackType.VIDEO),
        ]),
      );

      await expect(service.render(projectId, orgId, mockUser)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should throw UnprocessableEntityException when video track has no clips', async () => {
      editorProjectsService.markAsRendering.mockResolvedValue(
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
            ingredientId: videoIngredientId,
            sourceEndFrame: 300,
            sourceStartFrame: 0,
            textOverlay: null,
          },
          {
            ingredientId: videoIngredientId,
            sourceEndFrame: 600,
            sourceStartFrame: 300,
            textOverlay: null,
          },
        ],
        type: EditorTrackType.VIDEO,
      };
      editorProjectsService.markAsRendering.mockResolvedValue(
        makeProject([multiClipTrack]),
      );

      await expect(service.render(projectId, orgId, mockUser)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should throw NotFoundException when source video not found', async () => {
      editorProjectsService.markAsRendering.mockResolvedValue(makeProject());
      ingredientsService.findOne.mockResolvedValue(null);

      await expect(service.render(projectId, orgId, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should call markAsFailed when post-transition step throws', async () => {
      editorProjectsService.markAsRendering.mockResolvedValue(makeProject());
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
        textOverlay: { position: 'bottom', text: 'Hello World' },
      });
      editorProjectsService.markAsRendering.mockResolvedValue(
        makeProject([makeTrack(EditorTrackType.VIDEO), textTrack]),
      );

      await service.render(projectId, orgId, mockUser);

      expect(fileQueueService.processVideo).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'add-text-overlay' }),
      );
    });

    it('should pass trim-video job type when no text overlay and video is trimmed', async () => {
      const trimmedTrack = makeTrack(EditorTrackType.VIDEO, {
        sourceEndFrame: 150,
        sourceStartFrame: 30,
      });
      editorProjectsService.markAsRendering.mockResolvedValue(
        makeProject([trimmedTrack]),
      );

      await service.render(projectId, orgId, mockUser);

      expect(fileQueueService.processVideo).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'trim-video' }),
      );
    });
  });
});
