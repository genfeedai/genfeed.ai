import { AssetsOperationsController } from '@api/collections/assets/controllers/operations/assets-operations.controller';
import type { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';
import type { CreateFromIngredientDto } from '@api/collections/assets/dto/create-from-ingredient.dto';
import type { GenerateAssetDto } from '@api/collections/assets/dto/generate-asset.dto';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ConfigService } from '@api/config/config.service';
import { ValidationConfigService } from '@api/config/services/validation.config';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import type { User } from '@clerk/backend';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  AssetCategory,
  AssetParent,
  IngredientCategory,
  ModelCategory,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('AssetsOperationsController', () => {
  let controller: AssetsOperationsController;
  let assetsService: vi.Mocked<AssetsService>;
  let brandsService: vi.Mocked<BrandsService>;
  let cacheService: vi.Mocked<CacheService>;
  let filesClientService: vi.Mocked<FilesClientService>;
  let ingredientsService: vi.Mocked<IngredientsService>;
  let metadataService: vi.Mocked<MetadataService>;
  let promptBuilderService: vi.Mocked<PromptBuilderService>;
  let replicateService: vi.Mocked<ReplicateService>;
  let validationConfigService: vi.Mocked<ValidationConfigService>;
  let websocketService: vi.Mocked<NotificationsPublisherService>;
  let loggerService: vi.Mocked<LoggerService>;
  let configService: ConfigService;

  const mockUserId = '507f191e810c19729de860ee';
  const mockOrgId = '507f191e810c19729de860ee';
  const mockBrandId = '507f191e810c19729de860ee';
  const mockIngredientId = '507f191e810c19729de860ee';
  const mockMetadataId = '507f191e810c19729de860ee';
  const mockAssetId = '507f191e810c19729de860ee';

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: mockBrandId.toString(),
      organization: mockOrgId.toString(),
      user: mockUserId.toString(),
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/assets',
    params: {},
    query: {},
    user: mockUser,
  } as unknown as Request;

  const mockFile = {
    buffer: Buffer.from('file'),
    mimetype: 'image/png',
    originalname: 'logo.png',
    size: 1024,
  } as unknown as Express.Multer.File;

  const mockBrand = {
    _id: mockBrandId,
    description: 'Brand description',
    label: 'Test Brand',
    primaryColor: '#111111',
    secondaryColor: '#222222',
    text: 'Brand text',
  };

  const mockAsset = {
    _id: mockAssetId,
    category: AssetCategory.LOGO,
    parent: mockBrandId,
    parentModel: AssetParent.BRAND,
    user: mockUserId,
  };

  const mockIngredient = {
    _id: mockIngredientId,
    category: IngredientCategory.IMAGE,
    metadata: mockMetadataId,
    user: mockUserId,
  };

  const mockMetadata = {
    _id: mockMetadataId,
    height: 1024,
    width: 1024,
  };

  beforeEach(async () => {
    assetsService = {
      create: vi.fn().mockResolvedValue(mockAsset),
      patch: vi.fn().mockResolvedValue(mockAsset),
      patchAll: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue({}),
    } as unknown as vi.Mocked<AssetsService>;

    brandsService = {
      findOne: vi.fn().mockResolvedValue(mockBrand),
    } as unknown as vi.Mocked<BrandsService>;

    cacheService = {
      del: vi.fn().mockResolvedValue(0),
      invalidateByTags: vi.fn().mockResolvedValue(0),
    } as unknown as vi.Mocked<CacheService>;

    configService = { isProduction: false } as unknown as ConfigService;

    filesClientService = {
      copyInS3: vi.fn().mockResolvedValue({}),
      uploadToS3: vi.fn().mockResolvedValue({}),
    } as unknown as vi.Mocked<FilesClientService>;

    ingredientsService = {
      findOne: vi.fn().mockResolvedValue(mockIngredient),
    } as unknown as vi.Mocked<IngredientsService>;

    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    metadataService = {
      findOne: vi.fn().mockResolvedValue(mockMetadata),
    } as unknown as vi.Mocked<MetadataService>;

    promptBuilderService = {
      buildPrompt: vi.fn().mockResolvedValue({ input: { prompt: 'built' } }),
    } as unknown as vi.Mocked<PromptBuilderService>;

    replicateService = {
      generateTextToImage: vi.fn().mockResolvedValue('generation-id'),
    } as unknown as vi.Mocked<ReplicateService>;

    validationConfigService = {
      getAllowedImageExtensions: vi.fn().mockReturnValue(['png']),
      getAllowedImageMimeTypes: vi.fn().mockReturnValue(['image/png']),
      getMaxFileSize: vi.fn().mockReturnValue(50 * 1024 * 1024),
    } as unknown as vi.Mocked<ValidationConfigService>;

    websocketService = {
      publishAssetStatus: vi.fn().mockResolvedValue(undefined),
      publishBrandRefresh: vi.fn().mockResolvedValue(undefined),
    } as unknown as vi.Mocked<NotificationsPublisherService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssetsOperationsController],
      providers: [
        { provide: ConfigService, useValue: configService },
        { provide: AssetsService, useValue: assetsService },
        { provide: BrandsService, useValue: brandsService },
        { provide: CacheService, useValue: cacheService },
        { provide: FilesClientService, useValue: filesClientService },
        { provide: IngredientsService, useValue: ingredientsService },
        { provide: LoggerService, useValue: loggerService },
        { provide: MetadataService, useValue: metadataService },
        { provide: PromptBuilderService, useValue: promptBuilderService },
        { provide: ReplicateService, useValue: replicateService },
        { provide: ValidationConfigService, useValue: validationConfigService },
        { provide: NotificationsPublisherService, useValue: websocketService },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: vi
          .fn()
          .mockImplementation((_context, next) => next.handle()),
      })
      .compile();

    controller = module.get<AssetsOperationsController>(
      AssetsOperationsController,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generate', () => {
    it('should generate an asset for a brand parent', async () => {
      const generateDto: GenerateAssetDto = {
        category: AssetCategory.BANNER,
        model: 'test-model',
        parent: mockBrandId,
        parentModel: AssetParent.BRAND,
        text: 'Generate a banner',
      };

      const result = await controller.generate(
        mockRequest,
        mockUser,
        generateDto,
      );

      expect(brandsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: mockBrandId,
          isDeleted: false,
          organization: expect.any(String),
        }),
      );
      expect(assetsService.patchAll).toHaveBeenCalledWith(
        expect.objectContaining({
          category: AssetCategory.BANNER,
          parent: expect.any(String),
        }),
        { isDeleted: true },
      );
      expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
        MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3_FAST,
        expect.objectContaining({
          height: 1080,
          modelCategory: ModelCategory.IMAGE,
          width: 1920,
        }),
        mockOrgId.toString(),
      );
      expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
        MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3_FAST,
        expect.any(Object),
      );
      expect(assetsService.patch).toHaveBeenCalledWith(mockAssetId, {
        externalId: 'generation-id',
      });
      expect(result).toBeDefined();
    });

    it('should require a brand when parent model is not brand', async () => {
      const userWithoutBrand = {
        id: 'user_456',
        publicMetadata: {
          organization: mockOrgId.toString(),
          user: mockUserId.toString(),
        },
      } as unknown as User;

      const generateDto: GenerateAssetDto = {
        category: AssetCategory.LOGO,
        model: 'test-model',
        parent: mockBrandId,
        parentModel: AssetParent.ORGANIZATION,
        text: 'Generate a logo',
      };

      await expect(
        controller.generate(mockRequest, userWithoutBrand, generateDto),
      ).rejects.toThrow(ValidationException);
    });

    it('should reject invalid asset categories', async () => {
      const generateDto: GenerateAssetDto = {
        category: AssetCategory.REFERENCE,
        model: 'test-model',
        parent: mockBrandId,
        parentModel: AssetParent.BRAND,
        text: 'Generate a reference',
      };

      await expect(
        controller.generate(mockRequest, mockUser, generateDto),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw when generation id is missing', async () => {
      replicateService.generateTextToImage.mockResolvedValueOnce(
        null as unknown as string,
      );

      const generateDto: GenerateAssetDto = {
        category: AssetCategory.LOGO,
        model: 'test-model',
        parent: mockBrandId,
        parentModel: AssetParent.BRAND,
        text: 'Generate a logo',
      };

      await expect(
        controller.generate(mockRequest, mockUser, generateDto),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('createUpload', () => {
    it('should upload an asset and publish updates', async () => {
      const uploadDto: CreateAssetDto = {
        category: AssetCategory.LOGO,
        parent: mockBrandId.toString(),
        parentModel: AssetParent.BRAND,
      };

      const result = await controller.createUpload(
        mockRequest,
        mockUser,
        mockFile,
        uploadDto,
      );

      expect(assetsService.patchAll).toHaveBeenCalledWith(
        expect.objectContaining({
          category: AssetCategory.LOGO,
          isDeleted: false,
          parent: expect.any(String),
          parentModel: AssetParent.BRAND,
        }),
        { isDeleted: true },
      );
      expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
        'brands',
        'links',
        'assets',
        'public',
      ]);
      expect(filesClientService.uploadToS3).toHaveBeenCalledWith(
        mockAssetId,
        'logos',
        {
          contentType: 'image/png',
          data: mockFile.buffer,
          type: 'buffer',
        },
      );
      expect(websocketService.publishAssetStatus).toHaveBeenCalledWith(
        mockAssetId.toString(),
        'completed',
        mockUserId.toString(),
        expect.objectContaining({
          assetId: mockAssetId.toString(),
          category: AssetCategory.LOGO,
        }),
      );
      expect(websocketService.publishBrandRefresh).toHaveBeenCalledWith(
        mockBrandId.toString(),
        mockUserId.toString(),
        expect.objectContaining({
          assetId: mockAssetId.toString(),
          category: AssetCategory.LOGO,
        }),
      );
      expect(result).toBeDefined();
    });

    it('should throw when file is missing', async () => {
      const uploadDto: CreateAssetDto = {
        category: AssetCategory.BANNER,
        parent: mockBrandId.toString(),
        parentModel: AssetParent.BRAND,
      };

      await expect(
        controller.createUpload(
          mockRequest,
          mockUser,
          undefined as unknown as Express.Multer.File,
          uploadDto,
        ),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('createFromIngredient', () => {
    it('should create an asset from an ingredient', async () => {
      const createDto: CreateFromIngredientDto = {
        category: AssetCategory.LOGO,
        ingredientId: mockIngredientId.toString(),
        parent: mockBrandId.toString(),
      };

      const result = await controller.createFromIngredient(
        mockRequest,
        mockUser,
        createDto,
      );

      expect(ingredientsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: mockIngredientId.toString(),
          isDeleted: false,
          user: expect.any(String),
        }),
      );
      expect(metadataService.findOne).toHaveBeenCalledWith({
        _id: mockMetadataId,
        isDeleted: false,
      });
      expect(filesClientService.copyInS3).toHaveBeenCalledWith(
        mockIngredientId.toString(),
        mockAssetId.toString(),
        'images',
        'logos',
      );
      expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
        'brands',
        'links',
        'assets',
        'public',
      ]);
      expect(websocketService.publishAssetStatus).toHaveBeenCalledWith(
        mockAssetId.toString(),
        'completed',
        mockUserId.toString(),
        expect.objectContaining({
          assetId: mockAssetId.toString(),
          category: AssetCategory.LOGO,
        }),
      );
      expect(result).toBeDefined();
    });

    it('should throw when ingredient is missing', async () => {
      ingredientsService.findOne.mockResolvedValueOnce(null);

      const createDto: CreateFromIngredientDto = {
        category: AssetCategory.LOGO,
        ingredientId: mockIngredientId.toString(),
        parent: mockBrandId.toString(),
      };

      await expect(
        controller.createFromIngredient(mockRequest, mockUser, createDto),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('should reject non-image ingredients', async () => {
      ingredientsService.findOne.mockResolvedValueOnce({
        ...mockIngredient,
        category: IngredientCategory.VIDEO,
      });

      const createDto: CreateFromIngredientDto = {
        category: AssetCategory.BANNER,
        ingredientId: mockIngredientId.toString(),
        parent: mockBrandId.toString(),
      };

      await expect(
        controller.createFromIngredient(mockRequest, mockUser, createDto),
      ).rejects.toThrow(ValidationException);
    });

    it('should reject missing metadata', async () => {
      metadataService.findOne.mockResolvedValueOnce(null);

      const createDto: CreateFromIngredientDto = {
        category: AssetCategory.LOGO,
        ingredientId: mockIngredientId.toString(),
        parent: mockBrandId.toString(),
      };

      await expect(
        controller.createFromIngredient(mockRequest, mockUser, createDto),
      ).rejects.toThrow(ValidationException);
    });

    it('should remove asset when copy fails', async () => {
      filesClientService.copyInS3.mockRejectedValueOnce(
        new Error('S3 failure'),
      );

      const createDto: CreateFromIngredientDto = {
        category: AssetCategory.LOGO,
        ingredientId: mockIngredientId.toString(),
        parent: mockBrandId.toString(),
      };

      await expect(
        controller.createFromIngredient(mockRequest, mockUser, createDto),
      ).rejects.toThrow(ValidationException);
      expect(assetsService.remove).toHaveBeenCalledWith(mockAssetId);
    });
  });
});
