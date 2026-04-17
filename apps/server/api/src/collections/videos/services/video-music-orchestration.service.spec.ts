import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { BackgroundMusicDto } from '@api/collections/videos/dto/create-video.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { PollingService } from '@api/shared/services/polling/polling.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  type OrchestrationContext,
  VideoMusicOrchestrationService,
} from './video-music-orchestration.service';

const makeContext = (): OrchestrationContext => ({
  brandId: 'test-object-id',
  clerkUserId: 'clerk_abc',
  organizationId: 'test-object-id',
  userId: 'test-object-id',
});

const makeMusic = (status: IngredientStatus = IngredientStatus.GENERATED) => ({
  _id: 'test-object-id',
  status,
});

describe('VideoMusicOrchestrationService', () => {
  let service: VideoMusicOrchestrationService;
  let musicsService: { findOne: ReturnType<typeof vi.fn> };
  let pollingService: { waitForIngredientCompletion: ReturnType<typeof vi.fn> };
  let routerService: { getDefaultModel: ReturnType<typeof vi.fn> };
  let promptsService: { create: ReturnType<typeof vi.fn> };
  let sharedService: { saveDocumentsInternal: ReturnType<typeof vi.fn> };
  let activitiesService: {
    create: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let websocketService: {
    publishBackgroundTaskUpdate: ReturnType<typeof vi.fn>;
    publishVideoComplete: ReturnType<typeof vi.fn>;
    publishMediaFailed: ReturnType<typeof vi.fn>;
  };
  let promptBuilderService: { buildPrompt: ReturnType<typeof vi.fn> };
  let replicateService: { runModel: ReturnType<typeof vi.fn> };
  let metadataService: { patch: ReturnType<typeof vi.fn> };
  let fileQueueService: {
    processVideo: ReturnType<typeof vi.fn>;
    waitForJob: ReturnType<typeof vi.fn>;
  };
  let filesClientService: { uploadToS3: ReturnType<typeof vi.fn> };
  let ingredientsService: { patch: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    musicsService = { findOne: vi.fn() };
    pollingService = {
      waitForIngredientCompletion: vi.fn().mockResolvedValue(undefined),
    };
    routerService = {
      getDefaultModel: vi.fn().mockResolvedValue(MODEL_KEYS.MUSICGEN),
    };
    promptsService = {
      create: vi.fn().mockResolvedValue({ _id: 'test-object-id' }),
    };
    sharedService = {
      saveDocumentsInternal: vi.fn().mockResolvedValue({
        ingredientData: { _id: 'test-object-id' },
        metadataData: { _id: 'test-object-id' },
      }),
    };
    activitiesService = {
      create: vi.fn().mockResolvedValue({ _id: 'test-object-id' }),
      patch: vi.fn().mockResolvedValue(undefined),
    };
    websocketService = {
      publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
      publishMediaFailed: vi.fn().mockResolvedValue(undefined),
      publishVideoComplete: vi.fn().mockResolvedValue(undefined),
    };
    promptBuilderService = {
      buildPrompt: vi
        .fn()
        .mockResolvedValue({ input: { duration: 30, prompt: 'test' } }),
    };
    replicateService = { runModel: vi.fn().mockResolvedValue('gen-123') };
    metadataService = { patch: vi.fn().mockResolvedValue(undefined) };
    fileQueueService = {
      processVideo: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
      waitForJob: vi.fn().mockResolvedValue({ outputPath: '/tmp/output.mp4' }),
    };
    filesClientService = {
      uploadToS3: vi.fn().mockResolvedValue({
        duration: 30,
        height: 1920,
        size: 10_000,
        width: 1080,
      }),
    };
    ingredientsService = { patch: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoMusicOrchestrationService,
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: ConfigService, useValue: { get: vi.fn() } },
        { provide: FailedGenerationService, useValue: {} },
        { provide: FileQueueService, useValue: fileQueueService },
        { provide: FilesClientService, useValue: filesClientService },
        { provide: IngredientsService, useValue: ingredientsService },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: MetadataService, useValue: metadataService },
        { provide: MusicsService, useValue: musicsService },
        { provide: PollingService, useValue: pollingService },
        { provide: PromptBuilderService, useValue: promptBuilderService },
        { provide: PromptsService, useValue: promptsService },
        { provide: ReplicateService, useValue: replicateService },
        { provide: RouterService, useValue: routerService },
        { provide: SharedService, useValue: sharedService },
        { provide: VideosService, useValue: {} },
        { provide: NotificationsPublisherService, useValue: websocketService },
      ],
    }).compile();

    service = module.get<VideoMusicOrchestrationService>(
      VideoMusicOrchestrationService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── resolveMusic ─────────────────────────────────────────────────────────

  describe('resolveMusic', () => {
    const ctx = makeContext();

    it('should return null when backgroundMusic has no ingredientId or autoGenerate', async () => {
      const dto: BackgroundMusicDto = {} as BackgroundMusicDto;
      const result = await service.resolveMusic(dto, 30, ctx);
      expect(result).toBeNull();
    });

    it('should return existing music ingredient when ingredientId is provided', async () => {
      const musicDoc = makeMusic(IngredientStatus.GENERATED);
      musicsService.findOne.mockResolvedValue(musicDoc);

      const dto: BackgroundMusicDto = {
        ingredientId: musicDoc._id.toString(),
      } as BackgroundMusicDto;

      const result = await service.resolveMusic(dto, 30, ctx);

      expect(result).toMatchObject({
        musicIngredientId: musicDoc._id.toString(),
        wasGenerated: false,
      });
    });

    it('should throw NOT_FOUND when music ingredient does not exist', async () => {
      musicsService.findOne.mockResolvedValue(null);

      const dto: BackgroundMusicDto = {
        ingredientId: 'test-object-id',
      } as BackgroundMusicDto;

      await expect(service.resolveMusic(dto, 30, ctx)).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.NOT_FOUND }),
      );
    });

    it('should throw BAD_REQUEST when music ingredient is not GENERATED', async () => {
      musicsService.findOne.mockResolvedValue(
        makeMusic(IngredientStatus.PROCESSING),
      );

      const dto: BackgroundMusicDto = {
        ingredientId: 'test-object-id',
      } as BackgroundMusicDto;

      await expect(service.resolveMusic(dto, 30, ctx)).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.BAD_REQUEST }),
      );
    });

    it('should auto-generate music and return wasGenerated=true', async () => {
      const dto: BackgroundMusicDto = {
        autoGenerate: { duration: 60, prompt: 'Chill vibes' },
      } as BackgroundMusicDto;

      const result = await service.resolveMusic(dto, 30, ctx);

      expect(result?.wasGenerated).toBe(true);
      expect(replicateService.runModel).toHaveBeenCalled();
      expect(result?.musicIngredientId).toBeDefined();
    });

    it('should throw INTERNAL_SERVER_ERROR when Replicate returns no generationId', async () => {
      replicateService.runModel.mockResolvedValue(null);

      const dto: BackgroundMusicDto = {
        autoGenerate: { duration: 30, prompt: 'Test' },
      } as BackgroundMusicDto;

      await expect(service.resolveMusic(dto, 30, ctx)).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.INTERNAL_SERVER_ERROR }),
      );
    });
  });

  // ─── waitForMusicCompletion ───────────────────────────────────────────────

  describe('waitForMusicCompletion', () => {
    it('should delegate to pollingService with correct defaults', async () => {
      await service.waitForMusicCompletion('ing-123');
      expect(pollingService.waitForIngredientCompletion).toHaveBeenCalledWith(
        'ing-123',
        120000,
        3000,
      );
    });

    it('should pass custom timeout to polling', async () => {
      await service.waitForMusicCompletion('ing-456', 60000);
      expect(pollingService.waitForIngredientCompletion).toHaveBeenCalledWith(
        'ing-456',
        60000,
        3000,
      );
    });
  });

  // ─── orchestrateVideoWithMusic ────────────────────────────────────────────

  describe('orchestrateVideoWithMusic', () => {
    it('should return original videoIngredientId when no music is needed', async () => {
      const videoId = 'test-object-id';
      const dto: BackgroundMusicDto = {} as BackgroundMusicDto;

      const result = await service.orchestrateVideoWithMusic(
        videoId,
        dto,
        30,
        50,
        false,
        makeContext(),
      );

      expect(result).toBe(videoId);
      expect(pollingService.waitForIngredientCompletion).toHaveBeenCalledWith(
        videoId,
        600000,
        5000,
      );
    });

    it('should wait for music if it was generated before merging', async () => {
      const videoId = 'test-object-id';
      const dto: BackgroundMusicDto = {
        autoGenerate: { duration: 30, prompt: 'Epic' },
      } as BackgroundMusicDto;

      await service.orchestrateVideoWithMusic(
        videoId,
        dto,
        30,
        80,
        false,
        makeContext(),
      );

      // pollingService called twice: once for video, once for music
      expect(pollingService.waitForIngredientCompletion).toHaveBeenCalledTimes(
        2,
      );
    });

    it('should not wait for music when using existing ingredient', async () => {
      const videoId = 'test-object-id';
      const musicDoc = makeMusic(IngredientStatus.GENERATED);
      musicsService.findOne.mockResolvedValue(musicDoc);

      const dto: BackgroundMusicDto = {
        ingredientId: musicDoc._id.toString(),
      } as BackgroundMusicDto;

      await service.orchestrateVideoWithMusic(
        videoId,
        dto,
        30,
        70,
        false,
        makeContext(),
      );

      // pollingService called only once (for video)
      expect(pollingService.waitForIngredientCompletion).toHaveBeenCalledTimes(
        1,
      );
    });
  });
});
