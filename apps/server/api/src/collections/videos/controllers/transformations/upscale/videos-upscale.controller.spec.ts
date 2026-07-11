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

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { VideosUpscaleController } from '@api/collections/videos/controllers/transformations/upscale/videos-upscale.controller';
import type { VideoEditDto } from '@api/collections/videos/dto/video-edit.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import type { Request } from 'express';

const mockReq = {} as Request;

const mockVideo = {
  brand: '507f1f77bcf86cd799439014',
  category: 'video',
  id: '507f1f77bcf86cd799439011',
  organization: '507f1f77bcf86cd799439013',
  user: '507f1f77bcf86cd799439012',
};

const mockUser = {
  id: 'user_123',
  publicMetadata: {
    brand: '507f1f77bcf86cd799439014',
    organization: '507f1f77bcf86cd799439013',
    user: '507f1f77bcf86cd799439012',
  },
} as unknown as User;

const ingredientId = '507f1f77bcf86cd799439015';
const metadataId = '507f1f77bcf86cd799439016';
const activityId = '507f1f77bcf86cd799439018';

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
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: {
          brand: mockVideo.brand,
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
      '507f1f77bcf86cd799439011',
      dto,
    );
    expect(result).toBeDefined();
    expect(result.id).toEqual(ingredientId);
  });

  it('should throw when video does not exist for upscale', async () => {
    mockServices.videosService.findOne.mockResolvedValue(null);
    const dto: VideoEditDto = {};
    await expect(
      controller.upscaleVideo(mockReq, mockUser, 'nonexistent', dto),
    ).rejects.toBeDefined();
  });

  it('should deduct credits after successful upscale', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const dto: VideoEditDto = {};
    await controller.upscaleVideo(
      mockReq,
      mockUser,
      '507f1f77bcf86cd799439011',
      dto,
    );
    expect(
      mockServices.creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439013',
      '507f1f77bcf86cd799439012',
      10,
      expect.stringContaining('Video upscaling'),
      expect.anything(),
    );
  });

  it('should handle failed generation when runModel returns null', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.replicateService.runModel.mockResolvedValueOnce(null);
    const dto: VideoEditDto = {};
    await controller.upscaleVideo(
      mockReq,
      mockUser,
      '507f1f77bcf86cd799439011',
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
      '507f1f77bcf86cd799439011',
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
      '507f1f77bcf86cd799439011',
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
      '507f1f77bcf86cd799439011',
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
      '507f1f77bcf86cd799439011',
      dto,
    );
    expect(mockServices.videosService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({ user: expect.anything() }),
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
      '507f1f77bcf86cd799439011',
      dto,
    );
    expect(mockServices.sharedService.saveDocuments).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({ transformations: ['upscaled'] }),
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
        '507f1f77bcf86cd799439011',
        dto,
      ),
    ).rejects.toThrow();
    expect(mockServices.loggerService.error).toHaveBeenCalled();
  });
});
