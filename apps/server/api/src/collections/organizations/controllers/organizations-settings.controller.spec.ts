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
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ByokService } from '@api/services/byok/byok.service';
import { WebhookDispatchService } from '@api/services/webhook-client/webhook-client.module';
import {
  type ISubscriptionOssReadModel,
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/contracts/interfaces/billing';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('OrganizationsSettingsController', () => {
  let controller: OrganizationsSettingsController;
  let organizationSettingsService: OrganizationSettingsService;
  let subscriptionsService: ISubscriptionsService;
  let mockReq: Request;

  const mockOrganizationSettings = {
    createdAt: new Date(),
    id: testId('setting'),
    isWhitelabelEnabled: false,
    organizationId: testId('org'),
    updatedAt: new Date(),
  };

  const mockSubscription = {
    cancelAtPeriodEnd: false,
    id: testId('subscription'),
    isDeleted: false,
    organizationId: testId('org'),
    plan: 'pro',
    status: 'active',
    userId: testId('user'),
  } satisfies ISubscriptionOssReadModel;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockOrganizationSettingsService = {
    ensureForOrganization: vi.fn(),
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

  const mockWebhookDispatchService = {
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
          provide: WebhookDispatchService,
          useValue: mockWebhookDispatchService,
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
    const organizationId = testId('org');

    it('prefers the repaired request context organization id when the path is stale', async () => {
      mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
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

      expect(
        organizationSettingsService.ensureForOrganization,
      ).toHaveBeenCalledWith('org_current');
      expect(result).toBeDefined();
    });

    it('serializes the setting returned by the canonical get-or-create policy', async () => {
      mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
        mockOrganizationSettings,
      );

      const result = await controller.getSettings(mockReq, organizationId);

      expect(
        organizationSettingsService.ensureForOrganization,
      ).toHaveBeenCalledWith(organizationId);
      expect(result).toEqual(mockOrganizationSettings);
    });
  });

  describe('updateSettings', () => {
    const organizationId = testId('org');
    const updateDto = {
      isWhitelabelEnabled: true,
    };

    it('patches the setting returned by the canonical get-or-create policy', async () => {
      mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
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

      expect(
        organizationSettingsService.ensureForOrganization,
      ).toHaveBeenCalledWith(organizationId);
      expect(organizationSettingsService.patch).toHaveBeenCalledWith(
        mockOrganizationSettings.id,
        updateDto,
      );
      expect(result).toEqual({
        ...mockOrganizationSettings,
        ...updateDto,
      });
    });

    it('rejects invalid avatar defaults before creating missing settings', async () => {
      mockIngredientsService.findAvatarImageById.mockResolvedValue(null);

      await expect(
        controller.updateSettings(mockReq, organizationId, {
          defaultAvatarIngredientId: 'invalid-avatar-id',
        }),
      ).rejects.toThrow(
        'Default avatar must reference an avatar image ingredient in this organization',
      );

      expect(mockIngredientsService.findAvatarImageById).toHaveBeenCalledWith(
        'invalid-avatar-id',
        organizationId,
      );
      expect(
        organizationSettingsService.ensureForOrganization,
      ).not.toHaveBeenCalled();
      expect(organizationSettingsService.patch).not.toHaveBeenCalled();
    });

    it('rejects an empty model allowlist before creating missing settings', async () => {
      await expect(
        controller.updateSettings(mockReq, organizationId, {
          enabledModelIds: [],
        }),
      ).rejects.toThrow(
        'At least one model must remain enabled for the organization',
      );

      expect(mockIngredientsService.findAvatarImageById).not.toHaveBeenCalled();
      expect(
        organizationSettingsService.ensureForOrganization,
      ).not.toHaveBeenCalled();
      expect(organizationSettingsService.patch).not.toHaveBeenCalled();
    });
  });

  describe('testWebhookDelivery', () => {
    const organizationId = testId('org');

    it('queues a publish webhook test delivery for organization owners', async () => {
      mockWebhookDispatchService.sendTestDelivery.mockResolvedValue({
        deliveryId: 'webhook-test:org-1:target.published:abc',
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

      expect(mockWebhookDispatchService.sendTestDelivery).toHaveBeenCalledWith({
        event: 'target.published',
        organizationId: 'org_current',
      });
      expect(result).toEqual({
        data: {
          deliveryId: 'webhook-test:org-1:target.published:abc',
          event: 'target.published',
          isTest: true,
          status: 'queued',
        },
      });
    });

    it.each(['generation.completed', 'workflow.execution.failed'] as const)(
      'queues a %s test delivery',
      async (event) => {
        mockWebhookDispatchService.sendTestDelivery.mockResolvedValue({
          deliveryId: `webhook-test:org-1:${event}:abc`,
          event,
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
          { event },
        );

        expect(
          mockWebhookDispatchService.sendTestDelivery,
        ).toHaveBeenCalledWith({
          event,
          organizationId: 'org_current',
        });
        expect(result.data.event).toBe(event);
      },
    );
  });

  describe('findOneSubscription', () => {
    const organizationId = testId('org');

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
    const organizationId = testId('org');
    const brandId = testId('brand');

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
