vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw { response, status: 400 };
  }),
  returnNotFound: vi.fn((source, id) => {
    throw { message: `${source} ${id} not found`, statusCode: 404 };
  }),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';

vi.mock('@api/collections/activities/services/activities.service', () => ({
  ActivitiesService: class {},
}));
vi.mock('@api/collections/credits/services/credits.utils.service', () => ({
  CreditsUtilsService: class {},
}));
vi.mock(
  '@api/shared/services/failed-generation/failed-generation.service',
  () => ({ FailedGenerationService: class {} }),
);
vi.mock(
  '@api/services/notifications/publisher/notifications-publisher.service',
  () => ({ NotificationsPublisherService: class {} }),
);
vi.mock('@api/shared/services/shared/shared.service', () => ({
  SharedService: class {},
}));
vi.mock('@api/collections/videos/services/videos.service', () => ({
  VideosService: class {},
}));
vi.mock('@api/collections/metadata/services/metadata.service', () => ({
  MetadataService: class {},
}));
vi.mock('@api/collections/models/services/models.service', () => ({
  ModelsService: class {},
}));
vi.mock('@api/services/router/router.service', () => ({
  RouterService: class {},
}));
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { VideosUpscaleController } from '@api/collections/videos/controllers/transformations/upscale/videos-upscale.controller';
import type { VideoEditDto } from '@api/collections/videos/dto/video-edit.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  TransformationCategory,
} from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const mockReq = {} as Request;

const videoBrandId = testId('brand');
const videoId = testId('video');
const videoOrganizationId = testId('org');
const videoUserId = testId('user');

const mockVideo = {
  brandId: videoBrandId,
  category: IngredientCategory.VIDEO,
  id: videoId,
  organizationId: videoOrganizationId,
  status: IngredientStatus.GENERATED,
  userId: videoUserId,
};

const mockUser = {
  id: 'user_123',
  brandId: videoBrandId,
  organizationId: videoOrganizationId,
  userId: videoUserId,
} as unknown as User;

const ingredientId = testId('ingredient');
const metadataId = testId('metadata');
const activityId = testId('activity');

describe('VideosUpscaleController', () => {
  let controller: VideosUpscaleController;

  const mockServices = {
    activitiesService: {
      create: vi.fn().mockResolvedValue({ id: activityId }),
    },
    configService: {
      get: vi.fn().mockReturnValue('https://api.example.com'),
      isDevelopment: false,
    },
    creditsUtilsService: { deductCreditsFromOrganization: vi.fn() },
    failedGenerationService: { handleFailedVideoGeneration: vi.fn() },
    filesClientService: {
      getPresignedDownloadUrl: vi
        .fn()
        .mockResolvedValue('https://s3.example.com/videos/signed?sig=abc'),
    },
    loggerService: { error: vi.fn(), log: vi.fn() },
    metadataService: { patch: vi.fn() },
    modelsService: { findOne: vi.fn().mockResolvedValue({ cost: 10 }) },
    promptBuilderService: {
      buildPrompt: vi.fn().mockResolvedValue({ input: {} }),
    },
    replicateService: { runModel: vi.fn().mockResolvedValue('gen123') },
    routerService: {
      getDefaultModel: vi
        .fn()
        .mockResolvedValue(MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE),
    },
    sharedService: {
      createMediaDocuments: vi.fn().mockResolvedValue({
        ingredientData: {
          brandId: mockVideo.brandId,
          id: ingredientId,
          type: 'video',
        },
        metadataData: { id: metadataId },
      }),
    },
    videosService: { findOne: vi.fn() },
    websocketService: {
      publishBackgroundTaskUpdate: vi.fn(),
      publishVideoComplete: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosUpscaleController],
      providers: [
        {
          provide: ActivitiesService,
          useValue: mockServices.activitiesService,
        },
        { provide: ConfigService, useValue: mockServices.configService },
        {
          provide: CreditsUtilsService,
          useValue: mockServices.creditsUtilsService,
        },
        {
          provide: FailedGenerationService,
          useValue: mockServices.failedGenerationService,
        },
        {
          provide: FilesClientService,
          useValue: mockServices.filesClientService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
        { provide: MetadataService, useValue: mockServices.metadataService },
        { provide: ModelsService, useValue: mockServices.modelsService },
        {
          provide: PromptBuilderService,
          useValue: mockServices.promptBuilderService,
        },
        { provide: ReplicateService, useValue: mockServices.replicateService },
        { provide: RouterService, useValue: mockServices.routerService },
        { provide: SharedService, useValue: mockServices.sharedService },
        { provide: VideosService, useValue: mockServices.videosService },
        {
          provide: NotificationsPublisherService,
          useValue: mockServices.websocketService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModelsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get<VideosUpscaleController>(VideosUpscaleController);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should upscale video and return ingredient data', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const dto: VideoEditDto = { targetFps: 60, targetResolution: '4k' };
    const result = await controller.upscaleVideo(
      mockReq,
      mockUser,
      videoId,
      dto,
    );
    expect(result).toBeDefined();
    expect(result.id).toEqual(ingredientId);
    expect(mockServices.promptBuilderService.buildPrompt).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      expect.objectContaining({
        target_fps: 60,
        target_resolution: '4k',
      }),
    );
    expect(mockServices.replicateService.runModel).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      expect.anything(),
    );
  });

  it('dispatches the selected ByteDance upscale model and options', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);

    await controller.upscaleVideo(mockReq, mockUser, videoId, {
      model: MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER,
      targetFps: 60,
      targetResolution: '2k',
    });

    expect(mockServices.promptBuilderService.buildPrompt).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER,
      expect.objectContaining({
        target_fps: 60,
        target_resolution: '2k',
      }),
    );
    expect(mockServices.replicateService.runModel).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER,
      expect.anything(),
    );
  });

  it('rejects an unsupported target before creating a child', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);

    await expect(
      controller.upscaleVideo(mockReq, mockUser, videoId, {
        model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        targetResolution: '2k',
      }),
    ).rejects.toThrow('does not support target resolution');
    expect(
      mockServices.sharedService.createMediaDocuments,
    ).not.toHaveBeenCalled();
  });

  it.each([
    [MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE, 120],
    [MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER, 25],
  ])(
    'rejects target FPS outside the selected model schema (%s, %s)',
    async (model, targetFps) => {
      mockServices.videosService.findOne.mockResolvedValue(mockVideo);

      await expect(
        controller.upscaleVideo(mockReq, mockUser, videoId, {
          model,
          targetFps,
        }),
      ).rejects.toThrow('does not support target FPS');
      expect(
        mockServices.sharedService.createMediaDocuments,
      ).not.toHaveBeenCalled();
    },
  );

  it('scopes source lookup to active videos in the organization', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);

    await controller.upscaleVideo(mockReq, mockUser, videoId, {});

    expect(mockServices.videosService.findOne).toHaveBeenCalledWith({
      category: IngredientCategory.VIDEO,
      id: videoId,
      isDeleted: false,
      organizationId: videoOrganizationId,
    });
  });

  it('rejects a source that is not completed before creating an output', async () => {
    mockServices.videosService.findOne.mockResolvedValue({
      ...mockVideo,
      status: IngredientStatus.PROCESSING,
    });

    await expect(
      controller.upscaleVideo(mockReq, mockUser, videoId, {}),
    ).rejects.toThrow('Only completed videos can be upscaled');
    expect(
      mockServices.sharedService.createMediaDocuments,
    ).not.toHaveBeenCalled();
    expect(mockServices.replicateService.runModel).not.toHaveBeenCalled();
  });

  it('accepts a validated keep as a completed upscale source', async () => {
    mockServices.videosService.findOne.mockResolvedValue({
      ...mockVideo,
      status: IngredientStatus.VALIDATED,
    });

    await controller.upscaleVideo(mockReq, mockUser, videoId, {
      targetResolution: '4k',
    });

    expect(mockServices.replicateService.runModel).toHaveBeenCalled();
  });

  it('should hand the model a presigned URL, not the public stream route', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const dto: VideoEditDto = {};

    await controller.upscaleVideo(mockReq, mockUser, videoId, dto);

    expect(
      mockServices.filesClientService.getPresignedDownloadUrl,
    ).toHaveBeenCalledWith(videoId, 'videos');
    expect(mockServices.promptBuilderService.buildPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        video: 'https://s3.example.com/videos/signed?sig=abc',
      }),
    );
  });

  it('should throw when video does not exist for upscale', async () => {
    mockServices.videosService.findOne.mockResolvedValue(null);
    const dto: VideoEditDto = {};
    await expect(
      controller.upscaleVideo(mockReq, mockUser, 'nonexistent', dto),
    ).rejects.toBeDefined();
  });

  it('should declare upscale credit pricing for the interceptor', () => {
    expect(
      Reflect.getMetadata(
        CREDITS_KEY,
        VideosUpscaleController.prototype.upscaleVideo,
      ),
    ).toEqual({
      description: 'Video upscaling',
      modelKey: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      source: ActivitySource.VIDEO_UPSCALE,
    });
  });

  it('should handle failed generation when runModel returns null', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.replicateService.runModel.mockResolvedValueOnce(null);
    const dto: VideoEditDto = {};
    await controller.upscaleVideo(mockReq, mockUser, videoId, dto);
    expect(
      mockServices.failedGenerationService.handleFailedVideoGeneration,
    ).toHaveBeenCalled();
  });

  it('should publish background task update on upscale start', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const dto: VideoEditDto = {};
    await controller.upscaleVideo(mockReq, mockUser, videoId, dto);
    expect(
      mockServices.websocketService.publishBackgroundTaskUpdate,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Video Upscale', status: 'processing' }),
    );
  });

  it('should create activity for video upscale', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const dto: VideoEditDto = {};
    await controller.upscaleVideo(mockReq, mockUser, videoId, dto);
    expect(mockServices.activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'video-upscale-processing' }),
    );
  });

  it('should use router default model when dto does not specify one', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const dto: VideoEditDto = {};
    await controller.upscaleVideo(mockReq, mockUser, videoId, dto);
    expect(mockServices.routerService.getDefaultModel).toHaveBeenCalled();
  });

  it('should save ingredient with UPSCALED transformation', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const dto: VideoEditDto = {};
    await controller.upscaleVideo(mockReq, mockUser, videoId, dto);
    expect(
      mockServices.sharedService.createMediaDocuments,
    ).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        transformations: [TransformationCategory.UPSCALED],
      }),
    );
  });

  it('should handle exception in replicate service gracefully', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.replicateService.runModel.mockRejectedValueOnce(
      new Error('timeout'),
    );
    const dto: VideoEditDto = {};
    await expect(
      controller.upscaleVideo(mockReq, mockUser, videoId, dto),
    ).rejects.toThrow();
    expect(
      mockServices.failedGenerationService.handleFailedVideoGeneration,
    ).toHaveBeenCalledWith(
      mockServices.videosService,
      ingredientId,
      `/videos/${ingredientId}`,
      mockUser.id,
      `user:${mockUser.id}`,
    );
    expect(mockServices.loggerService.error).toHaveBeenCalled();
  });
});
