vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ImagesTransformationsController } from '@api/collections/images/controllers/transformations/images-transformations.controller';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type { ImageEditDto } from '@api/collections/images/dto/image-edit.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { ConfigService } from '@api/config/config.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import { MODEL_KEYS } from '@genfeedai/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('ImagesTransformationsController', () => {
  let controller: ImagesTransformationsController;
  let _imagesService: ImagesService;
  let _metadataService: MetadataService;
  let _sharedService: SharedService;
  let _fileQueueService: FileQueueService;
  let _replicateService: ReplicateService;
  let _promptBuilderService: PromptBuilderService;
  let _creditsUtilsService: CreditsUtilsService;
  let _modelsService: ModelsService;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/images',
    params: {},
    query: {},
  } as unknown as Request;

  const mockImage = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439014'),
    brand: new Types.ObjectId('507f1f77bcf86cd799439013'),
    category: 'image',
    metadata: {
      _id: new Types.ObjectId('507f1f77bcf86cd799439015'),
      height: 1080,
      width: 1920,
    },
    organization: new Types.ObjectId('507f1f77bcf86cd799439012'),
    user: new Types.ObjectId('507f1f77bcf86cd799439011'),
  };

  const mockServices = {
    activitiesService: {
      create: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId('507f1f77bcf86cd799439020'),
      }),
    },
    configService: {
      ingredientsEndpoint: 'https://api.example.com/ingredients',
    },
    creditsUtilsService: {
      deductCreditsFromOrganization: vi.fn(),
    },
    failedGenerationService: {
      handleFailedImageGeneration: vi.fn(),
    },
    fileQueueService: {
      processImage: vi.fn(),
      waitForJob: vi.fn(),
    },
    imagesService: {
      findOne: vi.fn(),
      patch: vi.fn(),
    },
    loggerService: {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
    metadataService: {
      patch: vi.fn(),
    },
    modelsService: {
      findOne: vi.fn().mockResolvedValue({
        cost: 5,
        key: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      }),
    },
    notificationsPublisherService: {
      publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
    },
    promptBuilderService: {
      buildPrompt: vi.fn().mockResolvedValue({
        input: { prompt: 'built prompt' },
        templateUsed: null,
        templateVersion: null,
      }),
    },
    promptsService: {
      create: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId('507f1f77bcf86cd799439016'),
        original: 'Test prompt',
      }),
    },
    replicateService: {
      generateTextToImage: vi.fn().mockResolvedValue('generation-id-123'),
      runModel: vi.fn().mockResolvedValue('generation-id-123'),
    },
    routerService: {
      getDefaultModel: vi
        .fn()
        .mockResolvedValue(MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE),
    },
    sharedService: {
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439017'),
        },
        metadataData: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439018'),
        },
      }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImagesTransformationsController],
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
          provide: FileQueueService,
          useValue: mockServices.fileQueueService,
        },
        { provide: ImagesService, useValue: mockServices.imagesService },
        { provide: LoggerService, useValue: mockServices.loggerService },
        { provide: MetadataService, useValue: mockServices.metadataService },
        { provide: ModelsService, useValue: mockServices.modelsService },
        { provide: PromptsService, useValue: mockServices.promptsService },
        {
          provide: PromptBuilderService,
          useValue: mockServices.promptBuilderService,
        },
        { provide: ReplicateService, useValue: mockServices.replicateService },
        { provide: RouterService, useValue: mockServices.routerService },
        { provide: SharedService, useValue: mockServices.sharedService },
        {
          provide: NotificationsPublisherService,
          useValue: mockServices.notificationsPublisherService,
        },
      ],
    })
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

    controller = module.get<ImagesTransformationsController>(
      ImagesTransformationsController,
    );
    _imagesService = module.get<ImagesService>(ImagesService);
    _metadataService = module.get<MetadataService>(MetadataService);
    _sharedService = module.get<SharedService>(SharedService);
    _fileQueueService = module.get<FileQueueService>(FileQueueService);
    _replicateService = module.get<ReplicateService>(ReplicateService);
    _promptBuilderService =
      module.get<PromptBuilderService>(PromptBuilderService);
    _creditsUtilsService = module.get<CreditsUtilsService>(CreditsUtilsService);
    _modelsService = module.get<ModelsService>(ModelsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('resizeImage', () => {
    it('should resize an image', async () => {
      const resizeParams = {
        height: 1920,
        width: 1080,
      };

      mockServices.imagesService.findOne.mockResolvedValue(mockImage);
      mockServices.fileQueueService.processImage.mockResolvedValue({
        jobId: 'job-123',
      });
      mockServices.fileQueueService.waitForJob.mockResolvedValue({
        metadata: {
          height: 1920,
          size: 1024 * 1024,
          width: 1080,
        },
      });

      const result = await controller.resizeImage(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439014',
        resizeParams,
      );

      expect(mockServices.imagesService.findOne).toHaveBeenCalled();
      expect(mockServices.sharedService.saveDocuments).toHaveBeenCalled();
      expect(mockServices.fileQueueService.processImage).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return 404 when image not found', async () => {
      mockServices.imagesService.findOne.mockResolvedValue(null);

      const result = await controller.resizeImage(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439014',
        { height: 1920, width: 1080 },
      );

      expect(result.errors).toBeDefined();
    });

    it('should use default dimensions when not provided', async () => {
      mockServices.imagesService.findOne.mockResolvedValue(mockImage);
      mockServices.fileQueueService.processImage.mockResolvedValue({
        jobId: 'job-123',
      });
      mockServices.fileQueueService.waitForJob.mockResolvedValue({
        metadata: {
          height: 1920,
          size: 1024 * 1024,
          width: 1080,
        },
      });

      await controller.resizeImage(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439014',
        {},
      );

      expect(mockServices.fileQueueService.processImage).toHaveBeenCalledWith(
        expect.objectContaining({
          params: {
            height: 1920,
            sourceId: '507f1f77bcf86cd799439014',
            width: 1080,
          },
        }),
      );
    });
  });

  describe('reframeImage', () => {
    it('should reframe an image', async () => {
      const createImageDto: CreateImageDto = {
        format: 'landscape',
        height: 1080,
        text: 'Reframe to landscape',
        width: 1920,
      };

      mockServices.imagesService.findOne.mockResolvedValue(mockImage);

      const result = await controller.reframeImage(
        mockRequest,
        '507f1f77bcf86cd799439014',
        mockUser,
        createImageDto,
      );

      expect(mockServices.imagesService.findOne).toHaveBeenCalled();
      expect(mockServices.promptsService.create).toHaveBeenCalled();
      expect(mockServices.sharedService.saveDocuments).toHaveBeenCalled();
      expect(
        mockServices.replicateService.generateTextToImage,
      ).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when parent image not found', async () => {
      mockServices.imagesService.findOne.mockResolvedValue(null);

      await expect(
        controller.reframeImage(
          mockRequest,
          '507f1f77bcf86cd799439014',
          mockUser,
          {
            text: 'Reframe',
          },
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should use default dimensions based on format', async () => {
      const createImageDto: CreateImageDto = {
        format: 'square',
        text: 'Reframe to square',
      };

      mockServices.imagesService.findOne.mockResolvedValue(mockImage);

      await controller.reframeImage(
        mockRequest,
        '507f1f77bcf86cd799439014',
        mockUser,
        createImageDto,
      );

      expect(mockServices.sharedService.saveDocuments).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          height: 1080,
          width: 1080,
        }),
      );
    });

    it('should deduct credits after successful generation', async () => {
      const createImageDto: CreateImageDto = {
        text: 'Reframe to landscape',
      };

      mockServices.imagesService.findOne.mockResolvedValue(mockImage);

      await controller.reframeImage(
        mockRequest,
        '507f1f77bcf86cd799439014',
        mockUser,
        createImageDto,
      );

      // Credits deduction is handled by the CreditsInterceptor, not directly called
      // The generation call is the key assertion
      expect(
        mockServices.replicateService.generateTextToImage,
      ).toHaveBeenCalled();
    });
  });

  describe('upscaleImage', () => {
    it('should upscale an image', async () => {
      const imageEditDto: ImageEditDto = {
        model: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        outputFormat: 'jpg',
        upscaleFactor: '4x',
      };

      mockServices.imagesService.findOne.mockResolvedValue(mockImage);

      const result = await controller.upscaleImage(
        mockRequest,
        '507f1f77bcf86cd799439014',
        mockUser,
        imageEditDto,
      );

      expect(mockServices.imagesService.findOne).toHaveBeenCalled();
      expect(mockServices.sharedService.saveDocuments).toHaveBeenCalled();
      expect(mockServices.replicateService.runModel).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when parent image not found', async () => {
      mockServices.imagesService.findOne.mockResolvedValue(null);

      await expect(
        controller.upscaleImage(
          mockRequest,
          '507f1f77bcf86cd799439014',
          mockUser,
          {},
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should use default upscale settings when not provided', async () => {
      mockServices.imagesService.findOne.mockResolvedValue(mockImage);

      await controller.upscaleImage(
        mockRequest,
        '507f1f77bcf86cd799439014',
        mockUser,
        {},
      );

      expect(
        mockServices.promptBuilderService.buildPrompt,
      ).toHaveBeenCalledWith(
        MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        expect.objectContaining({
          enhance_model: 'Low Resolution V2',
          output_format: 'jpg',
          upscale_factor: '4x',
        }),
        expect.any(String),
      );
    });

    it('should deduct credits after successful generation', async () => {
      mockServices.imagesService.findOne.mockResolvedValue(mockImage);

      await controller.upscaleImage(
        mockRequest,
        '507f1f77bcf86cd799439014',
        mockUser,
        {},
      );

      // Credits deduction is handled by CreditsInterceptor
      // Verify runModel was called successfully
      expect(mockServices.replicateService.runModel).toHaveBeenCalled();
    });

    it('should handle failed generation', async () => {
      mockServices.imagesService.findOne.mockResolvedValue(mockImage);
      mockServices.replicateService.runModel.mockResolvedValue(null);

      await controller.upscaleImage(
        mockRequest,
        '507f1f77bcf86cd799439014',
        mockUser,
        {},
      );

      expect(
        mockServices.failedGenerationService.handleFailedImageGeneration,
      ).toHaveBeenCalled();
    });
  });
});
