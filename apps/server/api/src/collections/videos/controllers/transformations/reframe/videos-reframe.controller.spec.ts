vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw { response, status: 400 };
  }),
  returnNotFound: vi.fn((_type, _id) => {
    throw { status: 404 };
  }),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import type { User } from '@clerk/backend';
import { HttpException } from '@nestjs/common';

vi.mock('@api/collections/metadata/services/metadata.service', () => ({
  MetadataService: class {},
}));
vi.mock('@api/collections/models/services/models.service', () => ({
  ModelsService: class {},
}));
vi.mock('@api/collections/prompts/services/prompts.service', () => ({
  PromptsService: class {},
}));
vi.mock('@api/services/integrations/replicate/replicate.service', () => ({
  ReplicateService: class {},
}));
vi.mock('@api/services/prompt-builder/prompt-builder.service', () => ({
  PromptBuilderService: class {},
}));
vi.mock(
  '@api/shared/services/failed-generation/failed-generation.service',
  () => ({ FailedGenerationService: class {} }),
);
vi.mock('@api/shared/services/shared/shared.service', () => ({
  SharedService: class {},
}));
vi.mock('@api/collections/videos/services/videos.service', () => ({
  VideosService: class {},
}));
vi.mock('@api/collections/credits/services/credits.utils.service', () => ({
  CreditsUtilsService: class {},
}));
vi.mock('@api/collections/activities/services/activities.service', () => ({
  ActivitiesService: class {},
}));
vi.mock(
  '@api/services/notifications/publisher/notifications-publisher.service',
  () => ({ NotificationsPublisherService: class {} }),
);

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { VideosReframeController } from '@api/collections/videos/controllers/transformations/reframe/videos-reframe.controller';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const mockReq = {} as Request;

const mockVideo = {
  _id: '507f1f77bcf86cd799439011',
  brand: '507f1f77bcf86cd799439014',
  category: 'video',
  metadata: { duration: 10, height: 1080, width: 1920 },
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

const ingredientId = '507f1f77bcf86cd799439017';
const metadataId = '507f1f77bcf86cd799439016';
const promptId = '507f1f77bcf86cd799439015';
const activityId = '507f1f77bcf86cd799439018';

describe('VideosReframeController', () => {
  let controller: VideosReframeController;

  const mockServices = {
    activitiesService: {
      create: vi.fn().mockResolvedValue({ _id: activityId }),
    },
    configService: { ingredientsEndpoint: 'https://api.example.com' },
    creditsUtilsService: { deductCreditsFromOrganization: vi.fn() },
    failedGenerationService: { handleFailedVideoGeneration: vi.fn() },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    metadataService: { patch: vi.fn() },
    modelsService: { findOne: vi.fn().mockResolvedValue({ cost: 10 }) },
    promptBuilderService: {
      buildPrompt: vi.fn().mockResolvedValue({ input: {} }),
    },
    promptsService: {
      create: vi
        .fn()
        .mockResolvedValue({ _id: promptId, original: 'test prompt' }),
    },
    replicateService: {
      generateTextToVideo: vi.fn().mockResolvedValue('gen123'),
    },
    sharedService: {
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: { _id: ingredientId, brand: mockVideo.brand },
        metadataData: { _id: metadataId },
      }),
    },
    videosService: { findOne: vi.fn(), patch: vi.fn() },
    websocketService: {
      publishBackgroundTaskUpdate: vi.fn(),
      publishMediaFailed: vi.fn(),
      publishVideoComplete: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosReframeController],
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
        { provide: PromptsService, useValue: mockServices.promptsService },
        {
          provide: PromptBuilderService,
          useValue: mockServices.promptBuilderService,
        },
        { provide: ReplicateService, useValue: mockServices.replicateService },
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

    controller = module.get<VideosReframeController>(VideosReframeController);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should reframe video and return ingredient data', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const result = await controller.reframeVideo(
      mockReq,
      '507f1f77bcf86cd799439011',
      mockUser,
      {
        format: 'portrait',
        height: 1920,
        width: 1080,
      },
    );
    expect(result).toBeDefined();
    expect(result._id).toEqual(ingredientId);
  });

  it('should throw NOT_FOUND when parent video does not exist', async () => {
    mockServices.videosService.findOne.mockResolvedValue(null);
    await expect(
      controller.reframeVideo(mockReq, '507f1f77bcf86cd799439011', mockUser, {
        format: 'portrait',
      }),
    ).rejects.toThrow(HttpException);
  });

  it('should create a prompt with the video format text', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.reframeVideo(
      mockReq,
      '507f1f77bcf86cd799439011',
      mockUser,
      { format: 'square' },
    );
    expect(mockServices.promptsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ original: 'Reframe video to square format' }),
    );
  });

  it('should deduct credits after successful generation', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.reframeVideo(
      mockReq,
      '507f1f77bcf86cd799439011',
      mockUser,
      { format: 'portrait' },
    );
    expect(
      mockServices.creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439013',
      '507f1f77bcf86cd799439012',
      10,
      expect.stringContaining('Video reframe'),
      expect.anything(),
    );
  });

  it('should fallback to 10 credits when model cost is 0 (falsy)', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.modelsService.findOne.mockResolvedValueOnce({ cost: 0 });
    await controller.reframeVideo(
      mockReq,
      '507f1f77bcf86cd799439011',
      mockUser,
      { format: 'portrait' },
    );
    // 0 is falsy so `modelData?.cost || 10` falls back to 10
    expect(
      mockServices.creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      10,
      expect.anything(),
      expect.anything(),
    );
  });

  it('should handle failed generation when generateTextToVideo returns null', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.replicateService.generateTextToVideo.mockResolvedValueOnce(
      null,
    );
    await controller.reframeVideo(
      mockReq,
      '507f1f77bcf86cd799439011',
      mockUser,
      { format: 'landscape' },
    );
    expect(
      mockServices.failedGenerationService.handleFailedVideoGeneration,
    ).toHaveBeenCalled();
  });

  it('should handle exception in replicate service gracefully', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.replicateService.generateTextToVideo.mockRejectedValueOnce(
      new Error('API down'),
    );
    const result = await controller.reframeVideo(
      mockReq,
      '507f1f77bcf86cd799439011',
      mockUser,
      { format: 'portrait' },
    );
    expect(result).toBeDefined();
    expect(
      mockServices.failedGenerationService.handleFailedVideoGeneration,
    ).toHaveBeenCalled();
    expect(mockServices.loggerService.error).toHaveBeenCalled();
  });

  it('should publish background task update on reframe start', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.reframeVideo(
      mockReq,
      '507f1f77bcf86cd799439011',
      mockUser,
      { format: 'portrait' },
    );
    expect(
      mockServices.websocketService.publishBackgroundTaskUpdate,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Video Reframe',
        status: 'processing',
        userId: 'user_123',
      }),
    );
  });

  it('should cap portrait dimensions to 1080x1920', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.reframeVideo(
      mockReq,
      '507f1f77bcf86cd799439011',
      mockUser,
      {
        format: 'portrait',
        height: 8000,
        width: 4000,
      },
    );
    expect(mockServices.sharedService.saveDocuments).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({ height: 1920, width: 1080 }),
    );
  });
});
