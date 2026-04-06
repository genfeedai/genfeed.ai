vi.mock('@api/services/integrations/klingai/klingai.service', () => ({
  KlingAIService: class {},
}));

vi.mock('@api/services/integrations/comfyui/comfyui.service', () => ({
  ComfyUIService: class {},
}));

vi.mock('@api/services/integrations/fal/fal.service', () => ({
  FalService: class {},
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw new HttpException(response, 400);
  }),
  returnForbidden: vi.fn(),
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
    statusCode: 404,
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

vi.mock('@api/collections/templates/services/templates.service', () => ({
  TemplatesService: class {},
}));

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ImagesOperationsController } from '@api/collections/images/controllers/operations/images-operations.controller';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type { SplitImageDto } from '@api/collections/images/dto/split-image.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import type { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { TagEntity } from '@api/collections/tags/entities/tag.entity';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { ConfigService } from '@api/config/config.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { KlingAIService } from '@api/services/integrations/klingai/klingai.service';
import { LeonardoAIService } from '@api/services/integrations/leonardoai/leonardoai.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { WebhookClientService } from '@api/services/webhook-client/webhook-client.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { PollingService } from '@api/shared/services/polling/polling.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  ModelCategory,
  TagCategory,
  TagKey,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('ImagesOperationsController', () => {
  let controller: ImagesOperationsController;
  let brandsService: vi.Mocked<BrandsService>;
  let imagesService: vi.Mocked<ImagesService>;
  let _promptsService: vi.Mocked<PromptsService>;
  let sharedService: vi.Mocked<SharedService>;
  let metadataService: vi.Mocked<MetadataService>;
  let activitiesService: vi.Mocked<ActivitiesService>;
  let klingAIService: vi.Mocked<KlingAIService>;
  let leonardoaiService: vi.Mocked<LeonardoAIService>;
  let replicateService: vi.Mocked<ReplicateService>;
  let routerService: vi.Mocked<RouterService>;
  let pollingService: vi.Mocked<PollingService>;
  let filesClientService: vi.Mocked<FilesClientService>;
  let comfyUIService: vi.Mocked<ComfyUIService>;
  let tagsService: vi.Mocked<TagsService>;
  let _websocketService: vi.Mocked<NotificationsPublisherService>;
  let failedGenerationService: vi.Mocked<FailedGenerationService>;
  let creditsUtilsService: vi.Mocked<CreditsUtilsService>;
  let modelsService: vi.Mocked<ModelsService>;

  const mockUserId = new Types.ObjectId();
  const mockOrgId = new Types.ObjectId();
  const mockBrandId = new Types.ObjectId();
  const mockImageId = new Types.ObjectId();
  const mockMetadataId = new Types.ObjectId();
  const mockPromptId = new Types.ObjectId();
  const mockActivityId = new Types.ObjectId();
  const mockTagId = new Types.ObjectId();

  const mockUser = {
    id: 'clerk_user_123',
    publicMetadata: {
      brand: mockBrandId.toString(),
      organization: mockOrgId.toString(),
      user: mockUserId.toString(),
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/images',
    params: {},
    query: {},
    user: mockUser,
  } as unknown as Request;

  const mockBrand = {
    _id: mockBrandId,
    agentConfig: {
      voice: {
        audience: ['tech professionals'],
        hashtags: ['#tech', '#innovation'],
        style: 'authoritative',
        taglines: ['Innovation at scale'],
        tone: 'professional',
        values: ['excellence'],
      },
    },
    defaultImageModel: MODEL_KEYS.LEONARDOAI,
    description: 'Test brand description',
    label: 'Test Brand',
    organization: mockOrgId,
    primaryColor: '#ff0000',
    secondaryColor: '#00ff00',
    text: 'Brand text',
  };

  const mockImage = {
    _id: mockImageId,
    brand: mockBrandId,
    category: IngredientCategory.IMAGE,
    isDeleted: false,
    metadata: {
      _id: mockMetadataId,
      height: 1080,
      model: MODEL_KEYS.LEONARDOAI,
      width: 1920,
    },
    organization: mockOrgId,
    status: IngredientStatus.GENERATED,
    user: mockUserId,
  };

  const mockActivity = {
    _id: mockActivityId,
    toString: () => mockActivityId.toString(),
  };

  const mockSavedDocuments = {
    ingredientData: {
      _id: mockImageId,
      toString: () => mockImageId.toString(),
    },
    metadataData: {
      _id: mockMetadataId,
    },
  };

  const mockMembersService = {
    findOne: vi.fn(),
  };

  const mockPromptBuilderResult = {
    input: {
      prompt: 'built prompt text',
    },
    templateUsed: 'default',
    templateVersion: '1.0.0',
  };

  const mockTag = {
    _id: mockTagId,
    category: TagCategory.INGREDIENT,
    key: TagKey.SPLITTED,
    label: 'Splitted',
    organization: mockOrgId,
  };

  const mockFrameBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9rNwSAAAAABJRU5ErkJggg==',
    'base64',
  );

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImagesOperationsController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            ingredientsEndpoint: 'https://cdn.genfeed.ai',
          },
        },
        {
          provide: ActivitiesService,
          useValue: {
            create: vi.fn().mockResolvedValue(mockActivity),
          },
        },
        {
          provide: AssetsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: BrandsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(mockBrand),
          },
        },
        {
          provide: CreditsUtilsService,
          useValue: {
            checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
            getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
          },
        },
        {
          provide: FailedGenerationService,
          useValue: {
            handleFailedImageGeneration: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FilesClientService,
          useValue: {
            splitImage: vi.fn().mockResolvedValue({
              frames: [mockFrameBuffer, mockFrameBuffer],
            }),
            uploadToS3: vi.fn().mockResolvedValue({
              height: 1080,
              publicUrl: 'https://cdn.genfeed.ai/images/test.png',
              s3Key: 'ingredients/images/test',
              size: 1024 * 1024,
              width: 1920,
            }),
          },
        },
        {
          provide: ComfyUIService,
          useValue: {
            generateImage: vi.fn().mockResolvedValue({
              filename: 'test.png',
              imageBuffer: mockFrameBuffer,
            }),
          },
        },
        {
          provide: FalService,
          useValue: {
            generateImage: vi.fn().mockResolvedValue({
              imageBuffer: mockFrameBuffer,
            }),
          },
        },
        {
          provide: PollingService,
          useValue: {
            waitForIngredientCompletion: vi.fn(),
            waitForMultipleIngredientsCompletion: vi.fn(),
          },
        },
        {
          provide: ImagesService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(mockImage),
            patch: vi.fn().mockResolvedValue(mockImage),
          },
        },
        {
          provide: IngredientsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: OrganizationSettingsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({
              defaultImageModel: MODEL_KEYS.LEONARDOAI,
            }),
          },
        },
        {
          provide: KlingAIService,
          useValue: {
            queueGenerateImage: vi
              .fn()
              .mockResolvedValue('kling-generation-id'),
          },
        },
        {
          provide: LeonardoAIService,
          useValue: {
            generateImage: vi.fn().mockResolvedValue('leonardo-generation-id'),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            verbose: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: MembersService, useValue: mockMembersService },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({ cost: 5, key: 'leonardoai' }),
          },
        },
        {
          provide: MetadataService,
          useValue: {
            patch: vi.fn().mockResolvedValue({}),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            sendIngredientNotification: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PromptBuilderService,
          useValue: {
            buildPrompt: vi.fn().mockResolvedValue(mockPromptBuilderResult),
          },
        },
        {
          provide: PromptsService,
          useValue: {
            create: vi.fn().mockResolvedValue({
              _id: mockPromptId,
              original: 'Test prompt',
            }),
          },
        },
        {
          provide: ReplicateService,
          useValue: {
            generateTextToImage: vi
              .fn()
              .mockResolvedValue('replicate-generation-id'),
          },
        },
        {
          provide: RouterService,
          useValue: {
            getDefaultModel: vi.fn().mockResolvedValue(MODEL_KEYS.LEONARDOAI),
            selectModel: vi.fn().mockResolvedValue({
              reason: 'Best model for image generation',
              selectedModel: MODEL_KEYS.LEONARDOAI,
            }),
          },
        },
        {
          provide: SharedService,
          useValue: {
            saveDocuments: vi.fn().mockResolvedValue(mockSavedDocuments),
            updateDocuments: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TagsService,
          useValue: {
            create: vi.fn().mockResolvedValue(mockTag),
            findOne: vi.fn().mockResolvedValue(mockTag),
          },
        },
        {
          provide: WebhookClientService,
          useValue: {
            sendIngredientWebhook: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: {
            publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
            publishVideoComplete: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
      .overrideGuard(ModelsGuard)
      .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: vi.fn().mockImplementation((_context, next) => {
          return next.handle();
        }),
      })
      .compile();

    controller = new ImagesOperationsController(
      module.get(ConfigService),
      module.get(ActivitiesService),
      module.get(AssetsService),
      module.get(BrandsService),
      module.get(ComfyUIService),
      module.get(CreditsUtilsService),
      module.get(FailedGenerationService),
      module.get(FilesClientService),
      module.get(FalService),
      module.get(PollingService),
      module.get(ImagesService),
      module.get(IngredientsService),
      module.get(OrganizationSettingsService),
      module.get(KlingAIService),
      module.get(LeonardoAIService),
      module.get(LoggerService),
      module.get(MetadataService),
      module.get(ModelsService),
      module.get(NotificationsService),
      module.get(PromptBuilderService),
      module.get(PromptsService),
      module.get(ReplicateService),
      module.get(RouterService),
      module.get(SharedService),
      module.get(TagsService),
      module.get(WebhookClientService),
      module.get(NotificationsPublisherService),
    );
    brandsService = module.get(BrandsService);
    imagesService = module.get(ImagesService);
    _promptsService = module.get(PromptsService);
    sharedService = module.get(SharedService);
    metadataService = module.get(MetadataService);
    activitiesService = module.get(ActivitiesService);
    klingAIService = module.get(KlingAIService);
    leonardoaiService = module.get(LeonardoAIService);
    replicateService = module.get(ReplicateService);
    routerService = module.get(RouterService);
    pollingService = module.get(PollingService);
    filesClientService = module.get(FilesClientService);
    comfyUIService = module.get(ComfyUIService);
    tagsService = module.get(TagsService);
    _websocketService = module.get(NotificationsPublisherService);
    failedGenerationService = module.get(FailedGenerationService);
    creditsUtilsService = module.get(CreditsUtilsService);
    modelsService = module.get(ModelsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const baseCreateDto: CreateImageDto = {
      height: 1080,
      text: 'Generate a beautiful sunset image',
      width: 1920,
    };

    it('should throw HttpException for unsupported model', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.RUNWAYML,
      };

      await expect(
        controller.create(mockRequest, dto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should create an image with KlingAI model', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.KLINGAI_V2,
      };

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(klingAIService.queueGenerateImage).toHaveBeenCalled();
      expect(metadataService.patch).toHaveBeenCalledWith(
        mockMetadataId,
        expect.any(MetadataEntity),
      );
      expect(result).toBeDefined();
    });

    it('should create an image with LeonardoAI model', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.LEONARDOAI,
      };

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(leonardoaiService.generateImage).toHaveBeenCalled();
      expect(metadataService.patch).toHaveBeenCalledWith(
        mockMetadataId,
        expect.any(MetadataEntity),
      );
      expect(result).toBeDefined();
    });

    it('should create an image with Replicate model', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
      };

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(replicateService.generateTextToImage).toHaveBeenCalled();
      expect(metadataService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle Replicate model by destination string', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: 'black-forest-labs/flux-2-pro' as string,
      };

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(replicateService.generateTextToImage).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when prompt is missing', async () => {
      const dto: CreateImageDto = {
        height: 1080,
        width: 1920,
      };

      await expect(
        controller.create(mockRequest, dto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error when brand not found', async () => {
      brandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.create(mockRequest, baseCreateDto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should fall back to default model when model is invalid', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: 'invalid-model' as string,
      };

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(result).toBeDefined();
    });

    it('should handle auto model selection', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        autoSelectModel: true,
        model: undefined,
      };

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(routerService.selectModel).toHaveBeenCalledWith(
        expect.objectContaining({
          category: ModelCategory.IMAGE,
        }),
      );
      expect(result).toBeDefined();
    });

    it('should use brand default model when no model specified', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: undefined,
      };

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(result).toBeDefined();
    });

    it('should handle multiple outputs for Replicate models', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
        outputs: 3,
      };

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(replicateService.generateTextToImage).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should route genfeed-ai models to ComfyUI instead of Replicate', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
        waitForCompletion: true,
      };

      imagesService.findOne.mockResolvedValue({
        ...mockImage,
        cdnUrl: 'https://cdn.genfeed.ai/images/test.png',
        status: IngredientStatus.GENERATED,
      } as unknown as IngredientEntity);

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(comfyUIService.generateImage).toHaveBeenCalledWith(
        MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
        expect.objectContaining({
          height: dto.height,
          prompt: 'Test prompt',
          width: dto.width,
        }),
      );
      expect(replicateService.generateTextToImage).not.toHaveBeenCalled();
      expect(filesClientService.uploadToS3).toHaveBeenCalledWith(
        mockImageId.toString(),
        'images',
        expect.objectContaining({
          contentType: 'image/png',
          type: FileInputType.BUFFER,
        }),
      );
      expect(result).toBeDefined();
    });

    it('should handle waitForCompletion for LeonardoAI', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.LEONARDOAI,
        waitForCompletion: true,
      };

      pollingService.waitForIngredientCompletion.mockResolvedValue(
        mockImage as unknown as IngredientEntity,
      );

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(pollingService.waitForIngredientCompletion).toHaveBeenCalledWith(
        mockImageId.toString(),
        180000,
        2000,
        expect.any(Array),
      );
      expect(result).toBeDefined();
    });

    it('should handle waitForCompletion timeout', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.LEONARDOAI,
        waitForCompletion: true,
      };

      const timeoutError = new Error('Polling timeout');
      (timeoutError as Record<string, unknown>).name = 'PollingTimeoutError';
      pollingService.waitForIngredientCompletion.mockRejectedValue(
        timeoutError,
      );
      imagesService.findOne.mockResolvedValue({
        ...mockImage,
        status: IngredientStatus.PROCESSING,
      } as unknown as IngredientEntity);

      await expect(
        controller.create(mockRequest, dto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should handle KlingAI generation failure', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.KLINGAI_V2,
        waitForCompletion: true,
      };

      klingAIService.queueGenerateImage.mockRejectedValue(
        new Error('Generation failed'),
      );

      await expect(
        controller.create(mockRequest, dto, mockUser),
      ).rejects.toThrow('Generation failed');

      expect(
        failedGenerationService.handleFailedImageGeneration,
      ).toHaveBeenCalled();
    });

    it('should handle LeonardoAI generation failure', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.LEONARDOAI,
        waitForCompletion: true,
      };

      leonardoaiService.generateImage.mockRejectedValue(
        new Error('Generation failed'),
      );

      await expect(
        controller.create(mockRequest, dto, mockUser),
      ).rejects.toThrow('Generation failed');

      expect(
        failedGenerationService.handleFailedImageGeneration,
      ).toHaveBeenCalled();
    });

    it('should handle null generation ID from KlingAI', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.KLINGAI_V2,
        waitForCompletion: true,
      };

      klingAIService.queueGenerateImage.mockResolvedValue(
        null as unknown as string,
      );

      await expect(
        controller.create(mockRequest, dto, mockUser),
      ).rejects.toThrow();

      expect(
        failedGenerationService.handleFailedImageGeneration,
      ).toHaveBeenCalled();
    });

    it('should pass style and camera options', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        camera: 'wide angle',
        lens: 'fish eye',
        lighting: 'natural',
        model: MODEL_KEYS.LEONARDOAI,
        mood: 'dramatic',
        scene: 'outdoor',
        style: 'cinematic',
      };

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(result).toBeDefined();
    });

    it('should handle prompt template option', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.LEONARDOAI,
        promptTemplate: 'image.product.default',
        useTemplate: true,
      };

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(result).toBeDefined();
    });

    it('should use default dimensions if not provided', async () => {
      const dto: CreateImageDto = {
        model: MODEL_KEYS.LEONARDOAI,
        text: 'Test prompt',
      };

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(sharedService.saveDocuments).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          height: 1080,
          width: 1920,
        }),
      );
      expect(result).toBeDefined();
    });

    it('should handle waitForCompletion for Replicate', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
        waitForCompletion: true,
      };

      pollingService.waitForMultipleIngredientsCompletion.mockResolvedValue([
        mockImage,
      ] as unknown as IngredientEntity[]);

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(
        pollingService.waitForMultipleIngredientsCompletion,
      ).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should validate credits after model resolution when creditsConfig is deferred', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        autoSelectModel: true,
        model: undefined,
      };

      const requestWithDeferred = {
        ...mockRequest,
        creditsConfig: {
          amount: 0,
          deferred: true,
          description: 'Image generation',
        },
      } as unknown as Request;

      modelsService.findOne.mockResolvedValue({ cost: 10, key: 'leonardoai' });
      creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
        true,
      );

      const result = await controller.create(
        requestWithDeferred,
        dto,
        mockUser,
      );

      expect(modelsService.findOne).toHaveBeenCalled();
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(mockOrgId.toString(), expect.any(Number));
      expect(result).toBeDefined();
    });

    it('should throw when deferred credit check finds insufficient credits', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        autoSelectModel: true,
        model: undefined,
      };

      const requestWithDeferred = {
        ...mockRequest,
        creditsConfig: {
          amount: 0,
          deferred: true,
          description: 'Image generation',
        },
      } as unknown as Request;

      modelsService.findOne.mockResolvedValue({ cost: 10, key: 'leonardoai' });
      creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
        false,
      );
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(3);

      await expect(
        controller.create(requestWithDeferred, dto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should use fallback cost when model not found in DB during deferred check', async () => {
      const dto: CreateImageDto = {
        ...baseCreateDto,
        autoSelectModel: true,
        model: undefined,
      };

      const requestWithDeferred = {
        ...mockRequest,
        creditsConfig: {
          amount: 0,
          deferred: true,
          description: 'Image generation',
        },
      } as unknown as Request;

      modelsService.findOne.mockResolvedValue(null);
      creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
        true,
      );

      const result = await controller.create(
        requestWithDeferred,
        dto,
        mockUser,
      );

      // Should use fallback cost of 5
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(mockOrgId.toString(), 5);
      expect(result).toBeDefined();
    });
  });

  describe('splitContactSheet', () => {
    const splitDto: SplitImageDto = {
      borderInset: 0,
      gridCols: 2,
      gridRows: 2,
    };

    it('should split a contact sheet into frames', async () => {
      const result = await controller.splitContactSheet(
        mockRequest,
        mockImageId.toString(),
        splitDto,
        mockUser,
      );

      expect(imagesService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(Types.ObjectId),
          isDeleted: false,
        }),
        expect.any(Array),
      );
      expect(filesClientService.splitImage).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.data.frames).toBeDefined();
    });

    it('should throw error for invalid ObjectId', async () => {
      await expect(
        controller.splitContactSheet(
          mockRequest,
          'invalid-id',
          splitDto,
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error when image not found', async () => {
      imagesService.findOne.mockResolvedValue(null);

      await expect(
        controller.splitContactSheet(
          mockRequest,
          mockImageId.toString(),
          splitDto,
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should create splitted tag if not exists', async () => {
      tagsService.findOne.mockResolvedValue(null);
      tagsService.create.mockResolvedValue(mockTag as unknown as TagEntity);

      await controller.splitContactSheet(
        mockRequest,
        mockImageId.toString(),
        splitDto,
        mockUser,
      );

      expect(tagsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: TagCategory.INGREDIENT,
          key: TagKey.SPLITTED,
          label: 'Splitted',
        }),
      );
    });

    it('should use existing splitted tag if exists', async () => {
      tagsService.findOne.mockResolvedValue(mockTag as unknown as TagEntity);

      await controller.splitContactSheet(
        mockRequest,
        mockImageId.toString(),
        splitDto,
        mockUser,
      );

      expect(tagsService.create).not.toHaveBeenCalled();
    });

    it('should create activity for split operation', async () => {
      await controller.splitContactSheet(
        mockRequest,
        mockImageId.toString(),
        splitDto,
        mockUser,
      );

      expect(activitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          value: expect.stringContaining('contact-sheet-split'),
        }),
      );
    });

    it('should upload each frame to S3', async () => {
      filesClientService.splitImage.mockResolvedValue({
        frames: [
          mockFrameBuffer,
          mockFrameBuffer,
          mockFrameBuffer,
          mockFrameBuffer,
        ],
      });

      await controller.splitContactSheet(
        mockRequest,
        mockImageId.toString(),
        splitDto,
        mockUser,
      );

      expect(filesClientService.uploadToS3).toHaveBeenCalledTimes(4);
    });

    it('should handle custom border inset', async () => {
      const dtoWithInset: SplitImageDto = {
        borderInset: 10,
        gridCols: 2,
        gridRows: 2,
      };

      await controller.splitContactSheet(
        mockRequest,
        mockImageId.toString(),
        dtoWithInset,
        mockUser,
      );

      expect(filesClientService.splitImage).toHaveBeenCalledWith(
        expect.any(String),
        2,
        2,
        10,
      );
    });

    it('should handle different grid configurations', async () => {
      const largeGridDto: SplitImageDto = {
        borderInset: 0,
        gridCols: 4,
        gridRows: 3,
      };

      filesClientService.splitImage.mockResolvedValue({
        frames: Array.from({ length: 12 }, () => mockFrameBuffer),
      });

      const result = await controller.splitContactSheet(
        mockRequest,
        mockImageId.toString(),
        largeGridDto,
        mockUser,
      );

      expect(filesClientService.splitImage).toHaveBeenCalledWith(
        expect.any(String),
        3,
        4,
        0,
      );
      expect(result.data.frames.length).toBe(12);
    });

    it('should set parent reference on split frames', async () => {
      await controller.splitContactSheet(
        mockRequest,
        mockImageId.toString(),
        splitDto,
        mockUser,
      );

      expect(sharedService.saveDocuments).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          parent: expect.any(Types.ObjectId),
        }),
      );
    });

    it('should update status to GENERATED for each frame', async () => {
      filesClientService.splitImage.mockResolvedValue({
        frames: [mockFrameBuffer, mockFrameBuffer],
      });

      await controller.splitContactSheet(
        mockRequest,
        mockImageId.toString(),
        splitDto,
        mockUser,
      );

      expect(imagesService.patch).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        { status: IngredientStatus.GENERATED },
      );
    });
  });

  describe('error handling', () => {
    it('should handle service errors gracefully', async () => {
      brandsService.findOne.mockRejectedValue(new Error('Database error'));

      await expect(
        controller.create(mockRequest, { text: 'test' }, mockUser),
      ).rejects.toThrow('Database error');
    });

    it('should handle Replicate generation failure gracefully', async () => {
      const dto: CreateImageDto = {
        height: 1080,
        model: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
        text: 'Test',
        waitForCompletion: true,
        width: 1920,
      };

      replicateService.generateTextToImage.mockRejectedValue(
        new Error('Replicate error'),
      );

      await expect(
        controller.create(mockRequest, dto, mockUser),
      ).rejects.toThrow('Replicate error');

      expect(
        failedGenerationService.handleFailedImageGeneration,
      ).toHaveBeenCalled();
    });
  });
});
