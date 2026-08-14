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
vi.mock(
  '@server/services/files-microservice/client/files-client.service',
  () => ({ FilesClientService: class {} }),
);

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { VideosUpscaleController } from '@api/collections/videos/controllers/transformations/upscale/videos-upscale.controller';
import type { VideoEditDto } from '@api/collections/videos/dto/video-edit.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ActivitySource, TransformationCategory } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import type { Request } from 'express';

const mockReq = {} as Request;

const mockVideo = {
  brandId: 'c07f1f77bcf86cd799439014',
  category: 'video',
  id: 'c07f1f77bcf86cd799439011',
  organizationId: 'c07f1f77bcf86cd799439013',
  userId: 'c07f1f77bcf86cd799439012',
};

const mockUser = {
  id: 'user_123',
  brandId: 'c07f1f77bcf86cd799439014',
  organizationId: 'c07f1f77bcf86cd799439013',
  userId: 'c07f1f77bcf86cd799439012',
} as unknown as User;

const ingredientId = 'c07f1f77bcf86cd799439015';
const metadataId = 'c07f1f77bcf86cd799439016';
const activityId = 'c07f1f77bcf86cd799439018';

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
        .mockResolvedValue('replicate-topaz-video-upscale'),
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
      'c07f1f77bcf86cd799439011',
      dto,
    );
    expect(result).toBeDefined();
    expect(result.id).toEqual(ingredientId);
  });

  it('should hand the model a presigned URL, not the public stream route', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const dto: VideoEditDto = {};

    await controller.upscaleVideo(
      mockReq,
      mockUser,
      'c07f1f77bcf86cd799439011',
      dto,
    );

    expect(
      mockServices.filesClientService.getPresignedDownloadUrl,
    ).toHaveBeenCalledWith('c07f1f77bcf86cd799439011', 'videos');
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
    await controller.upscaleVideo(
      mockReq,
      mockUser,
      'c07f1f77bcf86cd799439011',
      dto,
    );
    expect(
      mockServices.failedGenerationService.handleFailedVideoGeneration,
    ).toHaveBeenCalled();
  });

  it('should publish background task update on upscale start', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const dto: VideoEditDto = {};
    await controller.upscaleVideo(
      mockReq,
      mockUser,
      'c07f1f77bcf86cd799439011',
      dto,
    );
    expect(
      mockServices.websocketService.publishBackgroundTaskUpdate,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Video Upscale', status: 'processing' }),
    );
  });

  it('should create activity for video upscale', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const dto: VideoEditDto = {};
    await controller.upscaleVideo(
      mockReq,
      mockUser,
      'c07f1f77bcf86cd799439011',
      dto,
    );
    expect(mockServices.activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'video-upscale-processing' }),
    );
  });

  it('should use router default model when dto does not specify one', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const dto: VideoEditDto = {};
    await controller.upscaleVideo(
      mockReq,
      mockUser,
      'c07f1f77bcf86cd799439011',
      dto,
    );
    expect(mockServices.routerService.getDefaultModel).toHaveBeenCalled();
  });

  it('should query video with OR for user and organization', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const dto: VideoEditDto = {};
    await controller.upscaleVideo(
      mockReq,
      mockUser,
      'c07f1f77bcf86cd799439011',
      dto,
    );
    expect(mockServices.videosService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'c07f1f77bcf86cd799439011',
        OR: expect.arrayContaining([
          expect.objectContaining({ userId: expect.anything() }),
          expect.objectContaining({ organizationId: expect.anything() }),
        ]),
      }),
    );
  });

  it('should save ingredient with UPSCALED transformation', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const dto: VideoEditDto = {};
    await controller.upscaleVideo(
      mockReq,
      mockUser,
      'c07f1f77bcf86cd799439011',
      dto,
    );
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
      controller.upscaleVideo(
        mockReq,
        mockUser,
        'c07f1f77bcf86cd799439011',
        dto,
      ),
    ).rejects.toThrow();
    expect(mockServices.loggerService.error).toHaveBeenCalled();
  });
});
