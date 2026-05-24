import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { SubscriptionsController } from '@api/collections/subscriptions/controllers/subscriptions.controller';
import { CreateSubscriptionPreviewDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { ConfigService } from '@api/config/config.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { SubscriptionPlan } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;
  let subscriptionsService: SubscriptionsService;
  let creditsUtilsService: CreditsUtilsService;

  const mockUser: User = {
    id: 'user_123',
    organizationId: '507f1f77bcf86cd799439012',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockSubscription = {
    _id: '507f1f77bcf86cd799439014',
    createdAt: new Date(),
    currentPeriodEnd: new Date(),
    organization: '507f1f77bcf86cd799439012',
    status: 'active',
    stripeSubscriptionId: 'sub_123',
    type: SubscriptionPlan.MONTHLY,
    updatedAt: new Date(),
  };

  const mockSubscriptionsService = {
    changeSubscriptionPlan: vi.fn(),
    findAll: vi.fn(),
    findByOrganizationId: vi.fn().mockResolvedValue(null),
    previewSubscriptionChange: vi.fn(),
  };

  const mockCreditsUtilsService = {
    getCycleRemainingMetrics: vi.fn(),
    getOrganizationCreditsWithExpiration: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        {
          provide: SubscriptionsService,
          useValue: mockSubscriptionsService,
        },
        {
          provide: CreditsUtilsService,
          useValue: mockCreditsUtilsService,
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('') },
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SubscriptionsController>(SubscriptionsController);
    subscriptionsService =
      module.get<SubscriptionsService>(SubscriptionsService);
    creditsUtilsService = module.get<CreditsUtilsService>(CreditsUtilsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all subscriptions', async () => {
      const request = {} as Request;
      const subscriptions = [mockSubscription];

      mockSubscriptionsService.findAll.mockResolvedValue({
        docs: subscriptions,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      const result = await controller.findAll(request, {});

      expect(subscriptionsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('changePlan', () => {
    it('should change subscription plan', async () => {
      const changeData = { newPriceId: 'price_new' };
      const updatedSubscription = {
        ...mockSubscription,
        priceId: 'price_new',
      };

      mockSubscriptionsService.changeSubscriptionPlan.mockResolvedValue(
        updatedSubscription,
      );

      const result = await controller.changePlan(mockUser, changeData);

      expect(subscriptionsService.changeSubscriptionPlan).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        changeData.newPriceId,
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(updatedSubscription);
    });
  });

  describe('previewChange', () => {
    it('should preview subscription change', async () => {
      const dto: CreateSubscriptionPreviewDto = {
        price: 'price_new',
      };

      const preview = {
        currentPlan: 'pro',
        newPlan: 'enterprise',
        nextBillingDate: new Date(),
        proratedAmount: 50.0,
      };

      mockSubscriptionsService.previewSubscriptionChange.mockResolvedValue(
        preview,
      );

      const result = await controller.previewChange(mockUser, dto);

      expect(
        subscriptionsService.previewSubscriptionChange,
      ).toHaveBeenCalledWith(mockUser.publicMetadata.organization, dto.price);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(preview);
    });
  });

  describe('getCreditsBreakdown', () => {
    it('should return credits breakdown with cycle metrics', async () => {
      const request = {
        context: { organizationId: mockUser.publicMetadata.organization },
      } as Request;
      const creditsData = {
        credits: [
          {
            balance: 1000,
            source: 'credits-subscription',
          },
        ],
        total: 1000,
      };
      const cycleMetrics = {
        cycleTotal: 1500,
        remainingPercent: 66.67,
      };

      mockCreditsUtilsService.getOrganizationCreditsWithExpiration.mockResolvedValue(
        creditsData,
      );
      mockCreditsUtilsService.getCycleRemainingMetrics.mockResolvedValue(
        cycleMetrics,
      );
      mockSubscriptionsService.findByOrganizationId.mockResolvedValue({
        ...mockSubscription,
        currentPeriodEnd: new Date('2026-03-31T00:00:00.000Z'),
        type: SubscriptionPlan.MONTHLY,
      });

      const result = await controller.getCreditsBreakdown(mockUser, request);

      expect(
        creditsUtilsService.getOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith(mockUser.publicMetadata.organization);
      expect(
        mockCreditsUtilsService.getCycleRemainingMetrics,
      ).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          ...creditsData,
          ...cycleMetrics,
          planLimit: 35_000,
        }),
      );
    });

    it('should fallback to total-based percentage when cycle window is unavailable', async () => {
      const request = {
        context: { organizationId: mockUser.publicMetadata.organization },
      } as Request;
      const creditsData = {
        credits: [],
        total: 420,
      };

      mockCreditsUtilsService.getOrganizationCreditsWithExpiration.mockResolvedValue(
        creditsData,
      );
      mockSubscriptionsService.findByOrganizationId.mockResolvedValue(null);

      const result = await controller.getCreditsBreakdown(mockUser, request);

      expect(
        mockCreditsUtilsService.getCycleRemainingMetrics,
      ).not.toHaveBeenCalled();
      expect(result.data.cycleTotal).toBe(420);
      expect(result.data.remainingPercent).toBe(100);
    });

    it('should use request context organizationId when user metadata is missing', async () => {
      const request = {
        context: { organizationId: 'org_from_context' },
      } as Request;
      const userWithoutOrganization = {
        ...mockUser,
        publicMetadata: {
          user: '507f1f77bcf86cd799439011',
        },
      } as unknown as User;
      const creditsData = {
        credits: [],
        total: 0,
      };

      mockCreditsUtilsService.getOrganizationCreditsWithExpiration.mockResolvedValue(
        creditsData,
      );
      mockSubscriptionsService.findByOrganizationId.mockResolvedValue(null);

      await controller.getCreditsBreakdown(userWithoutOrganization, request);

      expect(
        creditsUtilsService.getOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith('org_from_context');
    });
  });
});
