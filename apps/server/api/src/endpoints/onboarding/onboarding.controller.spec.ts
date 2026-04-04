import { SetAccountTypeDto } from '@api/endpoints/onboarding/dto/account-type.dto';
import {
  BrandSetupDto,
  ConfirmBrandDataDto,
  SkipOnboardingDto,
  UpdateBrandNameDto,
} from '@api/endpoints/onboarding/dto/brand-setup.dto';
import { GeneratePreviewDto } from '@api/endpoints/onboarding/dto/generate-preview.dto';
import { AddReferenceImagesDto } from '@api/endpoints/onboarding/dto/reference-images.dto';
import { OnboardingController } from '@api/endpoints/onboarding/onboarding.controller';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { OrganizationCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('OnboardingController', () => {
  let controller: OnboardingController;
  let onboardingService: vi.Mocked<OnboardingService>;
  let _loggerService: vi.Mocked<LoggerService>;

  const mockUser: User = {
    id: 'user_123',
    publicMetadata: {
      organization: 'org_123',
    },
  } as unknown as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [
        {
          provide: OnboardingService,
          useValue: {
            addReferenceImages: vi.fn(),
            claimProactiveWorkspace: vi.fn(),
            completeFunnel: vi.fn(),
            confirmBrandData: vi.fn(),
            generateOnboardingPreview: vi.fn(),
            getOnboardingStatus: vi.fn(),
            getProactiveWorkspace: vi.fn(),
            setAccountType: vi.fn(),
            setupBrand: vi.fn(),
            skipOnboarding: vi.fn(),
            updateBrandName: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OnboardingController>(OnboardingController);
    onboardingService = module.get(OnboardingService);
    _loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStatus', () => {
    it('should return onboarding status', async () => {
      const mockStatus = {
        hasCompletedOnboarding: false,
        isFirstLogin: true,
      };

      onboardingService.getOnboardingStatus.mockResolvedValue(
        mockStatus as never,
      );

      const result = await controller.getStatus(mockUser);

      expect(onboardingService.getOnboardingStatus).toHaveBeenCalledWith(
        mockUser,
      );
      expect(result).toEqual(mockStatus);
    });

    it('should return completed onboarding status', async () => {
      const mockStatus = {
        hasCompletedOnboarding: true,
        isFirstLogin: false,
      };

      onboardingService.getOnboardingStatus.mockResolvedValue(
        mockStatus as never,
      );

      const result = await controller.getStatus(mockUser);

      expect(result.hasCompletedOnboarding).toBe(true);
      expect(result.isFirstLogin).toBe(false);
    });
  });

  describe('setupBrand', () => {
    it('should setup brand from URL successfully', async () => {
      const dto: BrandSetupDto = {
        url: 'https://example.com',
      };

      const mockResponse = {
        brandId: 'brand_123',
        extractedData: {
          brandVoice: {
            audience: 'Millennials',
            hashtags: ['#brand', '#company'],
            tone: 'professional',
            voice: 'friendly',
          },
          companyName: 'Example Corp',
          description: 'A company description',
          logoUrl: 'https://example.com/logo.png',
        },
        message: 'Brand setup complete',
        success: true,
      };

      onboardingService.setupBrand.mockResolvedValue(mockResponse as never);

      const result = await controller.setupBrand(dto, mockUser);

      expect(onboardingService.setupBrand).toHaveBeenCalledWith(dto, mockUser);
      expect(result.success).toBe(true);
      expect(result.brandId).toBe('brand_123');
      expect(result.extractedData.companyName).toBe('Example Corp');
    });

    it('should handle invalid URL', async () => {
      const dto: BrandSetupDto = {
        url: 'invalid-url',
      };

      const error = new Error('Invalid URL or scraping failed');
      onboardingService.setupBrand.mockRejectedValue(error);

      await expect(controller.setupBrand(dto, mockUser)).rejects.toThrow(error);
    });
  });

  describe('updateBrandName', () => {
    it('should update brand name successfully', async () => {
      const dto: UpdateBrandNameDto = {
        brandName: 'New Brand Name',
      };

      const mockResponse = {
        message: 'Brand name updated',
        success: true,
      };

      onboardingService.updateBrandName.mockResolvedValue(
        mockResponse as never,
      );

      const result = await controller.updateBrandName(dto, mockUser);

      expect(onboardingService.updateBrandName).toHaveBeenCalledWith(
        dto,
        mockUser,
      );
      expect(result.success).toBe(true);
    });
  });

  describe('confirmBrandData', () => {
    it('should confirm brand data with overrides', async () => {
      const brandId = 'brand_123';
      const dto: ConfirmBrandDataDto = {
        overrides: {
          companyName: 'Overridden Name',
          description: 'Overridden description',
        },
      };

      const mockResponse = {
        message: 'Brand data confirmed',
        success: true,
      };

      onboardingService.confirmBrandData.mockResolvedValue(
        mockResponse as never,
      );

      const result = await controller.confirmBrandData(brandId, dto, mockUser);

      expect(onboardingService.confirmBrandData).toHaveBeenCalledWith(
        brandId,
        dto,
        mockUser,
      );
      expect(result.success).toBe(true);
    });

    it('should confirm brand data without overrides', async () => {
      const brandId = 'brand_456';
      const dto: ConfirmBrandDataDto = {};

      const mockResponse = {
        message: 'Brand data confirmed',
        success: true,
      };

      onboardingService.confirmBrandData.mockResolvedValue(
        mockResponse as never,
      );

      const result = await controller.confirmBrandData(brandId, dto, mockUser);

      expect(onboardingService.confirmBrandData).toHaveBeenCalledWith(
        brandId,
        dto,
        mockUser,
      );
      expect(result.success).toBe(true);
    });
  });

  describe('skipOnboarding', () => {
    it('should skip onboarding successfully', async () => {
      const dto: SkipOnboardingDto = {};

      const mockResponse = {
        message: 'Onboarding skipped',
        success: true,
      };

      onboardingService.skipOnboarding.mockResolvedValue(mockResponse as never);

      const result = await controller.skipOnboarding(dto, mockUser);

      expect(onboardingService.skipOnboarding).toHaveBeenCalledWith(mockUser);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Onboarding skipped');
    });
  });

  describe('setAccountType', () => {
    it('should set account type to Creator', async () => {
      const dto: SetAccountTypeDto = {
        category: OrganizationCategory.CREATOR,
      };

      const mockResponse = {
        message: 'Account type set successfully',
        success: true,
      };

      onboardingService.setAccountType.mockResolvedValue(mockResponse as never);

      const result = await controller.setAccountType(dto, mockUser);

      expect(onboardingService.setAccountType).toHaveBeenCalledWith(
        mockUser,
        OrganizationCategory.CREATOR,
      );
      expect(result.success).toBe(true);
    });

    it('should set account type to Business', async () => {
      const dto: SetAccountTypeDto = {
        category: OrganizationCategory.BUSINESS,
      };

      const mockResponse = {
        message: 'Account type set successfully',
        success: true,
      };

      onboardingService.setAccountType.mockResolvedValue(mockResponse as never);

      const _result = await controller.setAccountType(dto, mockUser);

      expect(onboardingService.setAccountType).toHaveBeenCalledWith(
        mockUser,
        OrganizationCategory.BUSINESS,
      );
    });

    it('should set account type to Agency', async () => {
      const dto: SetAccountTypeDto = {
        category: OrganizationCategory.AGENCY,
      };

      const mockResponse = {
        message: 'Account type set successfully',
        success: true,
      };

      onboardingService.setAccountType.mockResolvedValue(mockResponse as never);

      const _result = await controller.setAccountType(dto, mockUser);

      expect(onboardingService.setAccountType).toHaveBeenCalledWith(
        mockUser,
        OrganizationCategory.AGENCY,
      );
    });
  });

  describe('completeFunnel', () => {
    it('should complete onboarding funnel', async () => {
      const mockResponse = {
        message: 'Funnel completed successfully',
        success: true,
      };

      onboardingService.completeFunnel.mockResolvedValue(mockResponse as never);

      const result = await controller.completeFunnel(mockUser);

      expect(onboardingService.completeFunnel).toHaveBeenCalledWith(mockUser);
      expect(result.success).toBe(true);
    });
  });

  describe('getProactiveWorkspace', () => {
    it('should return the prepared proactive workspace summary', async () => {
      const mockResponse = {
        outputs: [{ _id: 'post_1' }],
        proactiveStatus: 'started',
        success: true,
      };

      onboardingService.getProactiveWorkspace.mockResolvedValue(
        mockResponse as never,
      );

      const result = await controller.getProactiveWorkspace(mockUser);

      expect(onboardingService.getProactiveWorkspace).toHaveBeenCalledWith(
        mockUser,
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('claimProactiveWorkspace', () => {
    it('should claim a prepared proactive workspace for the invited user', async () => {
      const mockResponse = {
        outputs: [{ _id: 'post_1' }],
        proactiveStatus: 'started',
        success: true,
      };

      onboardingService.claimProactiveWorkspace.mockResolvedValue(
        mockResponse as never,
      );

      const result = await controller.claimProactiveWorkspace(mockUser);

      expect(onboardingService.claimProactiveWorkspace).toHaveBeenCalledWith(
        mockUser,
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('generatePreview', () => {
    it('should generate preview image successfully', async () => {
      const dto: GeneratePreviewDto = {
        brandId: 'brand_123',
        contentType: 'social-post',
      };

      const mockResponse = {
        imageUrl: 'https://cdn.example.com/preview.png',
        prompt: 'Generated prompt',
      };

      onboardingService.generateOnboardingPreview.mockResolvedValue(
        mockResponse as never,
      );

      const result = await controller.generatePreview(dto, mockUser);

      expect(onboardingService.generateOnboardingPreview).toHaveBeenCalledWith(
        dto,
        mockUser,
      );
      expect(result.imageUrl).toBe('https://cdn.example.com/preview.png');
      expect(result.prompt).toBe('Generated prompt');
    });

    it('should handle insufficient credits error', async () => {
      const dto: GeneratePreviewDto = {
        brandId: 'brand_456',
        contentType: 'hero-image',
      };

      const error = new Error('Insufficient credits');
      onboardingService.generateOnboardingPreview.mockRejectedValue(error);

      await expect(controller.generatePreview(dto, mockUser)).rejects.toThrow(
        'Insufficient credits',
      );
    });

    it('should handle brand not found error', async () => {
      const dto: GeneratePreviewDto = {
        brandId: 'brand_nonexistent',
        contentType: 'product',
      };

      const error = new Error('Brand not found');
      onboardingService.generateOnboardingPreview.mockRejectedValue(error);

      await expect(controller.generatePreview(dto, mockUser)).rejects.toThrow(
        'Brand not found',
      );
    });
  });

  describe('addReferenceImages', () => {
    it('should add reference images successfully', async () => {
      const brandId = 'brand_123';
      const dto: AddReferenceImagesDto = {
        images: [
          { type: 'face', url: 'https://example.com/face.jpg' },
          { type: 'logo', url: 'https://example.com/logo.png' },
        ],
      };

      const mockResponse = {
        count: 2,
        success: true,
      };

      onboardingService.addReferenceImages.mockResolvedValue(
        mockResponse as never,
      );

      const result = await controller.addReferenceImages(
        brandId,
        dto,
        mockUser,
      );

      expect(onboardingService.addReferenceImages).toHaveBeenCalledWith(
        brandId,
        dto.images,
        mockUser,
      );
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });

    it('should add single reference image', async () => {
      const brandId = 'brand_456';
      const dto: AddReferenceImagesDto = {
        images: [{ type: 'product', url: 'https://example.com/product.jpg' }],
      };

      const mockResponse = {
        count: 1,
        success: true,
      };

      onboardingService.addReferenceImages.mockResolvedValue(
        mockResponse as never,
      );

      const result = await controller.addReferenceImages(
        brandId,
        dto,
        mockUser,
      );

      expect(result.count).toBe(1);
    });

    it('should handle empty images array', async () => {
      const brandId = 'brand_789';
      const dto: AddReferenceImagesDto = {
        images: [],
      };

      const mockResponse = {
        count: 0,
        success: true,
      };

      onboardingService.addReferenceImages.mockResolvedValue(
        mockResponse as never,
      );

      const result = await controller.addReferenceImages(
        brandId,
        dto,
        mockUser,
      );

      expect(result.count).toBe(0);
    });
  });
});
