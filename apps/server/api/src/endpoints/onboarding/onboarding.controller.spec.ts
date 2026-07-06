import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { GeneratePreviewDto } from '@api/endpoints/onboarding/dto/generate-preview.dto';
import { SetPrefixDto } from '@api/endpoints/onboarding/dto/set-prefix.dto';
import { OnboardingController } from '@api/endpoints/onboarding/onboarding.controller';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

/**
 * The resource-shaped write routes (brand-setup, brand-name, brand confirm,
 * reference-images, skip, account-type, complete-funnel) were dissolved into
 * `/brands/*`, `/organizations/*`, and `/users/me` per REST audit #1354, so
 * this controller now only exposes genuine onboarding reads/AI actions.
 */
describe('OnboardingController', () => {
  let controller: OnboardingController;
  let onboardingService: vi.Mocked<OnboardingService>;

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
            checkPrefixAvailable: vi.fn(),
            claimProactiveWorkspace: vi.fn(),
            generateOnboardingPreview: vi.fn(),
            getInstallReadiness: vi.fn(),
            getOnboardingStatus: vi.fn(),
            getProactiveWorkspace: vi.fn(),
            setPrefix: vi.fn(),
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
  });

  describe('checkPrefixAvailable', () => {
    it('should normalize the prefix and return availability', async () => {
      onboardingService.checkPrefixAvailable.mockResolvedValue(true as never);

      const result = await controller.checkPrefixAvailable('gen');

      expect(onboardingService.checkPrefixAvailable).toHaveBeenCalledWith(
        'GEN',
      );
      expect(result).toEqual({ isAvailable: true, prefix: 'GEN' });
    });
  });

  describe('setPrefix', () => {
    it('should set the organization prefix', async () => {
      const dto: SetPrefixDto = { prefix: 'GEN' };
      const mockResponse = {
        message: 'Organization prefix set to "GEN"',
        prefix: 'GEN',
        success: true,
      };

      onboardingService.setPrefix.mockResolvedValue(mockResponse as never);

      const result = await controller.setPrefix(dto, mockUser);

      expect(onboardingService.setPrefix).toHaveBeenCalledWith(
        mockUser,
        dto.prefix,
      );
      expect(result).toEqual(mockResponse);
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
        contentType: 'social',
      } as GeneratePreviewDto;

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

    it('should propagate insufficient credits error', async () => {
      const dto: GeneratePreviewDto = {
        brandId: 'brand_456',
        contentType: 'ads',
      } as GeneratePreviewDto;

      const error = new Error('Insufficient credits');
      onboardingService.generateOnboardingPreview.mockRejectedValue(error);

      await expect(controller.generatePreview(dto, mockUser)).rejects.toThrow(
        'Insufficient credits',
      );
    });
  });
});
