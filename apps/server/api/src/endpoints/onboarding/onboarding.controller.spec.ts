import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { verifyBrandAccess } from '@api/collections/brands/controllers/brand-access.helpers';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { SetPrefixDto } from '@api/endpoints/onboarding/dto/set-prefix.dto';
import { OnboardingController } from '@api/endpoints/onboarding/onboarding.controller';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { OnboardingFirstDraftsService } from '@api/endpoints/onboarding/services/onboarding-first-drafts.service';
import { SKIP_ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

vi.mock('@api/collections/brands/controllers/brand-access.helpers', () => ({
  verifyBrandAccess: vi.fn(),
}));

/**
 * The resource-shaped write routes (brand-setup, brand-name, brand confirm,
 * reference-images, skip, account-type, complete-funnel) were dissolved into
 * `/brands/*`, `/organizations/*`, and `/users/me` per REST audit #1354, so
 * this controller now only exposes genuine onboarding reads/AI actions.
 */
describe('OnboardingController', () => {
  let controller: OnboardingController;
  let onboardingService: vi.Mocked<OnboardingService>;
  let firstDraftsService: vi.Mocked<OnboardingFirstDraftsService>;

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
        { provide: BrandsService, useValue: {} },
        {
          provide: OnboardingFirstDraftsService,
          useValue: { generate: vi.fn(), scan: vi.fn(), read: vi.fn() },
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
    firstDraftsService = module.get(OnboardingFirstDraftsService);
    vi.mocked(verifyBrandAccess).mockReset();
    vi.mocked(verifyBrandAccess).mockResolvedValue({} as never);
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
  describe('first drafts', () => {
    it('verifies brand access before scanning a link', async () => {
      firstDraftsService.scan.mockResolvedValue({ status: 'failed' } as never);

      await controller.scanBrand(mockUser, 'brand_1', {
        url: 'https://acme.co',
      });

      expect(verifyBrandAccess).toHaveBeenCalledWith(
        expect.anything(),
        'brand_1',
        mockUser,
      );
      expect(firstDraftsService.scan).toHaveBeenCalledWith(
        mockUser,
        'brand_1',
        'https://acme.co',
      );
    });

    it('verifies brand access before generating drafts', async () => {
      firstDraftsService.generate.mockResolvedValue({
        drafts: [],
        imageIngredientId: null,
        imageUrl: null,
        requestKey: null,
        status: 'unavailable',
      });

      await controller.generateDrafts(mockUser, 'brand_1', {});

      expect(verifyBrandAccess).toHaveBeenCalledWith(
        expect.anything(),
        'brand_1',
        mockUser,
      );
      expect(firstDraftsService.generate).toHaveBeenCalledWith(
        mockUser,
        'brand_1',
        {},
      );
    });

    it('does not touch another tenant brand when access is refused', async () => {
      vi.mocked(verifyBrandAccess).mockRejectedValue(new Error('Not found'));

      await expect(
        controller.generateDrafts(mockUser, 'brand_other', {}),
      ).rejects.toThrow('Not found');
      expect(firstDraftsService.generate).not.toHaveBeenCalled();
    });
  });
  it('checks brand access before recovering saved content', async () => {
    firstDraftsService.read.mockResolvedValue(null);
    await expect(
      controller.readDrafts(mockUser, 'brand_1'),
    ).resolves.toBeNull();
    expect(verifyBrandAccess).toHaveBeenCalledWith(
      expect.anything(),
      'brand_1',
      mockUser,
    );
    expect(firstDraftsService.read).toHaveBeenCalledWith(mockUser, 'brand_1');
  });
  it('rejects an organization override before recovering owner-bound onboarding', () => {
    const user: User = {
      id: testId('user'),
      userId: testId('user'),
      organizationId: testId('org'),
      brandId: testId('brand'),
      isSuperAdmin: true,
    };
    const request = {
      method: 'GET',
      user,
      query: { organizationId: testId('org', 2) },
    };
    const context = {
      getHandler: () => OnboardingController.prototype.readDrafts,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next = { handle: vi.fn(() => of(null)) };
    expect(() =>
      new TenantContextInterceptor().intercept(context, next),
    ).toThrow(ForbiddenException);
    expect(next.handle).not.toHaveBeenCalled();
    expect(firstDraftsService.read).not.toHaveBeenCalled();
    expect(user.organizationId).toBe(testId('org'));
  });

  it('never reads another organization’s saved onboarding content', async () => {
    vi.mocked(verifyBrandAccess).mockRejectedValueOnce(new Error('forbidden'));
    await expect(
      controller.readDrafts(mockUser, 'brand_other'),
    ).rejects.toThrow('forbidden');
    expect(firstDraftsService.read).not.toHaveBeenCalled();
  });
});
