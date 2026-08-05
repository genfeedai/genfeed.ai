vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
    statusCode: 404,
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

vi.mock(
  '@api/collections/organization-settings/dto/update-organization-setting.dto',
  () => ({
    UpdateOrganizationSettingDto: class UpdateOrganizationSettingDto {},
  }),
);

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsSettingsController } from '@api/collections/organizations/controllers/organizations-settings.controller';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ByokService } from '@api/services/byok/byok.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/webhook-client.module';
import {
  type ISubscriptionOssReadModel,
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('OrganizationsSettingsController', () => {
  let controller: OrganizationsSettingsController;
  let organizationSettingsService: OrganizationSettingsService;
  let subscriptionsService: ISubscriptionsService;
  let mockReq: Request;

  const mockOrganizationSettings = {
    createdAt: new Date(),
    id: '507f1f77bcf86cd799439011',
    isWhitelabelEnabled: false,
    organizationId: '507f1f77bcf86cd799439012',
    updatedAt: new Date(),
  };

  const mockSubscription = {
    cancelAtPeriodEnd: false,
    id: '507f1f77bcf86cd799439015',
    isDeleted: false,
    organizationId: '507f1f77bcf86cd799439012',
    plan: 'pro',
    status: 'active',
    userId: '507f1f77bcf86cd799439011',
  } satisfies ISubscriptionOssReadModel;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockOrganizationSettingsService = {
    ensureEnabledModelIds: vi.fn((settings) => Promise.resolve(settings)),
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  const mockBrandsService = {
    findOne: vi.fn(),
  };

  const mockIngredientsService = {
    findAvatarImageById: vi.fn(),
  };

  const mockSubscriptionsService = {
    findOne: vi.fn(),
  };

  const mockByokService = {
    getStatus: vi.fn().mockResolvedValue([]),
    removeKey: vi.fn().mockResolvedValue(undefined),
    saveKey: vi.fn().mockResolvedValue(undefined),
    validateKey: vi.fn().mockResolvedValue({ isValid: true }),
  };

  const mockPublishEventWebhookService = {
    sendTestDelivery: vi.fn(),
  };

  beforeEach(async () => {
    mockReq = {} as Request;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsSettingsController],
      providers: [
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: OrganizationSettingsService,
          useValue: mockOrganizationSettingsService,
        },
        {
          provide: BrandsService,
          useValue: mockBrandsService,
        },
        {
          provide: IngredientsService,
          useValue: mockIngredientsService,
        },
        {
          provide: SUBSCRIPTIONS_SERVICE,
          useValue: mockSubscriptionsService,
        },
        {
          provide: ByokService,
          useValue: mockByokService,
        },
        {
          provide: PublishEventWebhookService,
          useValue: mockPublishEventWebhookService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrganizationsSettingsController>(
      OrganizationsSettingsController,
    );
    organizationSettingsService = module.get<OrganizationSettingsService>(
      OrganizationSettingsService,
    );
    subscriptionsService = module.get<ISubscriptionsService>(
      SUBSCRIPTIONS_SERVICE,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSettings', () => {
    const organizationId = '507f1f77bcf86cd799439012';

    it('should return organization settings', async () => {
      mockOrganizationSettingsService.findOne.mockResolvedValue(
        mockOrganizationSettings,
      );

      const result = await controller.getSettings(mockReq, organizationId);

      expect(organizationSettingsService.findOne).toHaveBeenCalledWith({
        organizationId,
      });
      expect(result).toBeDefined();
    });

    it('prefers the repaired request context organization id when the path is stale', async () => {
      mockOrganizationSettingsService.findOne.mockResolvedValue(
        mockOrganizationSettings,
      );

      const result = await controller.getSettings(
        {
          context: {
            organizationId: 'org_current',
          },
        } as Request,
        'org_legacy',
      );

      expect(organizationSettingsService.findOne).toHaveBeenCalledWith({
        organizationId: 'org_current',
      });
      expect(result).toBeDefined();
    });

    it('should return not found when settings do not exist', async () => {
      mockOrganizationSettingsService.findOne.mockResolvedValue(null);

      const result = await controller.getSettings(mockReq, organizationId);

      expect(result).toHaveProperty('statusCode', 404);
    });
  });

  describe('updateSettings', () => {
    const organizationId = '507f1f77bcf86cd799439012';
    const updateDto = {
      isWhitelabelEnabled: true,
    };

    it('should update settings when settings exist', async () => {
      mockOrganizationSettingsService.findOne.mockResolvedValue(
        mockOrganizationSettings,
      );
      mockOrganizationSettingsService.patch.mockResolvedValue({
        ...mockOrganizationSettings,
        ...updateDto,
      });

      const result = await controller.updateSettings(
        mockReq,
        organizationId,
        updateDto,
      );

      expect(organizationSettingsService.findOne).toHaveBeenCalled();
      expect(organizationSettingsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return not found when settings do not exist', async () => {
      mockOrganizationSettingsService.findOne.mockResolvedValue(null);

      const result = await controller.updateSettings(
        mockReq,
        organizationId,
        updateDto,
      );

      expect(result).toHaveProperty('statusCode', 404);
    });

    it('should reject invalid avatar ingredient defaults', async () => {
      mockOrganizationSettingsService.findOne.mockResolvedValue(
        mockOrganizationSettings,
      );
      mockIngredientsService.findAvatarImageById.mockResolvedValue(null);

      await expect(
        controller.updateSettings(mockReq, organizationId, {
          defaultAvatarIngredientId: 'invalid-avatar-id',
        }),
      ).rejects.toThrow(
        'Default avatar must reference an avatar image ingredient in this organization',
      );
    });
  });

  describe('testWebhookDelivery', () => {
    const organizationId = '507f1f77bcf86cd799439012';

    it('queues a publish webhook test delivery for organization owners', async () => {
      mockPublishEventWebhookService.sendTestDelivery.mockResolvedValue({
        deliveryId: 'publish-test:org-1:target.published:abc',
        event: 'target.published',
        isTest: true,
        status: 'queued',
      });

      const result = await controller.testWebhookDelivery(
        {
          context: {
            organizationId: 'org_current',
          },
        } as Request,
        organizationId,
        { event: 'target.published' },
      );

      expect(
        mockPublishEventWebhookService.sendTestDelivery,
      ).toHaveBeenCalledWith({
        event: 'target.published',
        organizationId: 'org_current',
      });
      expect(result).toEqual({
        data: {
          deliveryId: 'publish-test:org-1:target.published:abc',
          event: 'target.published',
          isTest: true,
          status: 'queued',
        },
      });
    });
  });

  describe('findOneSubscription', () => {
    const organizationId = '507f1f77bcf86cd799439012';

    it('should return organization subscription', async () => {
      mockSubscriptionsService.findOne.mockResolvedValue(mockSubscription);

      const result = await controller.findOneSubscription(
        mockReq,
        organizationId,
      );

      expect(subscriptionsService.findOne).toHaveBeenCalledWith({
        organizationId,
      });
      expect(result).toBeDefined();
    });
  });

  describe('getFleetCapabilities', () => {
    const organizationId = '507f1f77bcf86cd799439012';
    const brandId = '507f1f77bcf86cd799439013';

    it('should return brand flag without probing managed fleet runtime', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        id: brandId,
        isFleetEnabled: true,
      });

      const result = await controller.getFleetCapabilities(
        mockReq,
        organizationId,
        brandId,
      );

      expect(mockBrandsService.findOne).toHaveBeenCalledWith(
        {
          id: brandId,
          isDeleted: false,
          organizationId,
        },
        'none',
      );
      expect(result).toMatchObject({
        brandEnabled: true,
        brandId,
        fleet: {
          images: false,
          llm: false,
          videos: false,
          voices: false,
        },
        id: `fleet-capabilities:${organizationId}:${brandId}`,
        organizationId,
      });
    });

    it('uses the repaired request context organization id for brand lookups', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        id: brandId,
        isFleetEnabled: false,
      });

      const result = await controller.getFleetCapabilities(
        {
          context: {
            organizationId: 'org_current',
          },
        } as Request,
        'org_legacy',
        brandId,
      );

      expect(mockBrandsService.findOne).toHaveBeenCalledWith(
        {
          id: brandId,
          isDeleted: false,
          organizationId: 'org_current',
        },
        'none',
      );
      expect(result).toMatchObject({
        brandEnabled: false,
        fleet: {
          images: false,
          llm: false,
          videos: false,
          voices: false,
        },
        organizationId: 'org_current',
      });
    });
  });
});
