import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AssetsOperationsController } from '@api/collections/assets/controllers/operations/assets-operations.controller';
import type { GenerateAssetDto } from '@api/collections/assets/dto/generate-asset.dto';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ValidationException } from '@api/exceptions/validation.exception';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  AssetCategory,
  AssetParent,
  ModelCategory,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('AssetsOperationsController', () => {
  let controller: AssetsOperationsController;
  let assetsService: vi.Mocked<AssetsService>;
  let brandsService: vi.Mocked<BrandsService>;
  let promptBuilderService: vi.Mocked<PromptBuilderService>;
  let replicateService: vi.Mocked<ReplicateService>;
  let loggerService: vi.Mocked<LoggerService>;
  let configService: ConfigService;

  const mockUserId = 'cmuser0000000000000000001';
  const mockOrgId = 'cmorganization000000000000001';
  const mockBrandId = 'cmbrand000000000000000001';
  const mockAssetId = 'cmasset000000000000000001';

  const mockUser = {
    id: 'user_123',
    brandId: mockBrandId.toString(),
    organizationId: mockOrgId.toString(),
    userId: mockUserId.toString(),
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/assets',
    params: {},
    query: {},
    user: mockUser,
  } as unknown as Request;

  const mockBrand = {
    id: mockBrandId,
    description: 'Brand description',
    label: 'Test Brand',
    primaryColor: '#111111',
    secondaryColor: '#222222',
    text: 'Brand text',
  };

  const mockAsset = {
    id: mockAssetId,
    category: AssetCategory.LOGO,
    parentBrandId: mockBrandId,
    parentType: AssetParent.BRAND,
    userId: mockUserId,
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

    configService = { isProduction: false } as unknown as ConfigService;

    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    promptBuilderService = {
      buildPrompt: vi.fn().mockResolvedValue({ input: { prompt: 'built' } }),
    } as unknown as vi.Mocked<PromptBuilderService>;

    replicateService = {
      generateTextToImage: vi.fn().mockResolvedValue('generation-id'),
    } as unknown as vi.Mocked<ReplicateService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssetsOperationsController],
      providers: [
        { provide: ConfigService, useValue: configService },
        { provide: AssetsService, useValue: assetsService },
        { provide: BrandsService, useValue: brandsService },
        { provide: LoggerService, useValue: loggerService },
        { provide: PromptBuilderService, useValue: promptBuilderService },
        { provide: ReplicateService, useValue: replicateService },
      ],
    })
      .overrideGuard(BetterAuthGuard)
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
        parentId: mockBrandId,
        parentType: AssetParent.BRAND,
        text: 'Generate a banner',
      };

      const result = await controller.generate(
        mockRequest,
        mockUser,
        generateDto,
      );

      expect(brandsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockBrandId,
          organizationId: expect.any(String),
        }),
      );
      expect(assetsService.patchAll).toHaveBeenCalledWith(
        expect.objectContaining({
          category: AssetCategory.BANNER,
          parentBrandId: expect.any(String),
        }),
        { isDeleted: true },
      );
      expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
        expect.objectContaining({
          height: 1080,
          modelCategory: ModelCategory.IMAGE,
          prompt:
            'Generate a professional landscape banner (1920x1080) for Test Brand. Brand description. Primary color: #111111. Secondary color: #222222. Style: modern, clean, professional',
          width: 1920,
        }),
        mockOrgId.toString(),
      );
      expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
        expect.any(Object),
      );
      expect(assetsService.patch).toHaveBeenCalledWith(mockAssetId, {
        externalId: 'generation-id',
      });
      expect(result).toBeDefined();
    });

    it('should reject a non-brand parent type', async () => {
      const userWithoutBrand = {
        id: 'user_456',
        organizationId: mockOrgId.toString(),
        userId: mockUserId.toString(),
      } as unknown as User;

      const generateDto: GenerateAssetDto = {
        category: AssetCategory.LOGO,
        model: 'test-model',
        parentId: mockBrandId,
        parentType: AssetParent.ORGANIZATION,
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
        parentId: mockBrandId,
        parentType: AssetParent.BRAND,
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
        parentId: mockBrandId,
        parentType: AssetParent.BRAND,
        text: 'Generate a logo',
      };

      await expect(
        controller.generate(mockRequest, mockUser, generateDto),
      ).rejects.toThrow(ValidationException);
    });
  });
});
