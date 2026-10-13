import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { SetPrefixDto } from '@api/endpoints/onboarding/dto/set-prefix.dto';
import { OnboardingController } from '@api/endpoints/onboarding/onboarding.controller';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { SKIP_ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
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
    organizationId: 'org_123',
  } as unknown as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [
        {
          provide: OnboardingService,
          useValue: {
            checkPrefixAvailable: vi.fn(),
            getInstallReadiness: vi.fn(),
            getOnboardingStatus: vi.fn(),
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

  it('lets onboarding status and readiness run before active-organization membership validation', () => {
    expect(
      Reflect.getMetadata(
        SKIP_ROLES_KEY,
        OnboardingController.prototype.getStatus,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        SKIP_ROLES_KEY,
        OnboardingController.prototype.getInstallReadiness,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        SKIP_ROLES_KEY,
        OnboardingController.prototype.checkPrefixAvailable,
      ),
    ).toBe(true);
  });

  it('keeps onboarding writes and preview generation membership-gated', () => {
    expect(
      Reflect.getMetadata(
        SKIP_ROLES_KEY,
        OnboardingController.prototype.setPrefix,
      ),
    ).toBeUndefined();
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
});
