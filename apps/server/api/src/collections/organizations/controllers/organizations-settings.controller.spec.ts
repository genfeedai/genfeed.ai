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
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsSettingsController } from '@api/collections/organizations/controllers/organizations-settings.controller';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ByokService } from '@api/services/byok/byok.service';
import { WebhookDispatchService } from '@api/services/webhook-client/webhook-client.module';
import { ByokProvider } from '@genfeedai/contracts';
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

  const mockModelsService = {
    findAvailableModels: vi.fn().mockResolvedValue([]),
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

  const organizationA = testId('org-a');
  const organizationB = testId('org-b');

  const memberRequest = (activeOrganizationId: string): Request =>
    ({
      context: { isSuperAdmin: false, organizationId: activeOrganizationId },
    }) as Request;

  const superAdminRequest = (activeOrganizationId: string): Request =>
    ({
      context: { isSuperAdmin: true, organizationId: activeOrganizationId },
    }) as Request;

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
          provide: ModelsService,
          useValue: mockModelsService,
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

    it('rejects a member addressing an organization other than their active one', async () => {
      await expect(
        controller.getSettings(memberRequest(organizationA), organizationB),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        organizationSettingsService.ensureForOrganization,
      ).not.toHaveBeenCalled();
    });

    it('reads the URL organization for a superadmin active in another org', async () => {
      mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
        mockOrganizationSettings,
      );

      await controller.getSettings(
        superAdminRequest(organizationA),
        organizationB,
      );

      expect(
        organizationSettingsService.ensureForOrganization,
      ).toHaveBeenCalledWith(organizationB);
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
    it.each(['onboardingJourneyMissions', 'onboardingJourneyCompletedAt'])(
      'rejects externally authored %s before creating or updating settings',
      async (field) => {
        await expect(
          controller.updateSettings(mockReq, testId('org'), { [field]: null }),
        ).rejects.toMatchObject({ status: 400 });
        expect(
          mockOrganizationSettingsService.ensureForOrganization,
        ).not.toHaveBeenCalled();
        expect(mockOrganizationSettingsService.patch).not.toHaveBeenCalled();
      },
    );

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

    describe('billing-controlled fields', () => {
      const billingPatches = [
        { subscriptionTier: 'enterprise' },
        { seatsLimit: 999 },
        { brandsLimit: 999 },
      ];

      it.each(billingPatches)(
        'rejects an org owner setting %o',
        async (billingPatch) => {
          await expect(
            controller.updateSettings(
              memberRequest(organizationA),
              organizationA,
              { isWhitelabelEnabled: true, ...billingPatch },
            ),
          ).rejects.toMatchObject({ status: 400 });
          expect(
            mockOrganizationSettingsService.ensureForOrganization,
          ).not.toHaveBeenCalled();
          expect(mockOrganizationSettingsService.patch).not.toHaveBeenCalled();
        },
      );

      it.each(billingPatches)(
        'lets a superadmin set %o',
        async (billingPatch) => {
          mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
            mockOrganizationSettings,
          );
          mockOrganizationSettingsService.patch.mockResolvedValue({
            ...mockOrganizationSettings,
            ...billingPatch,
          });

          await controller.updateSettings(
            superAdminRequest(organizationA),
            organizationA,
            billingPatch,
          );

          expect(organizationSettingsService.patch).toHaveBeenCalledWith(
            mockOrganizationSettings.id,
            billingPatch,
          );
        },
      );
    });

    describe('target organization', () => {
      it('writes the URL organization when a superadmin is active in another org', async () => {
        const organizationBSettings = {
          ...mockOrganizationSettings,
          id: testId('setting-b'),
          organizationId: organizationB,
        };
        mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
          organizationBSettings,
        );
        mockOrganizationSettingsService.patch.mockResolvedValue(
          organizationBSettings,
        );

        await controller.updateSettings(
          superAdminRequest(organizationA),
          organizationB,
          { seatsLimit: 10 },
        );

        expect(
          organizationSettingsService.ensureForOrganization,
        ).toHaveBeenCalledWith(organizationB);
        expect(
          organizationSettingsService.ensureForOrganization,
        ).not.toHaveBeenCalledWith(organizationA);
        expect(organizationSettingsService.patch).toHaveBeenCalledWith(
          organizationBSettings.id,
          { seatsLimit: 10 },
        );
      });

      it('rejects a member of org A patching org B', async () => {
        await expect(
          controller.updateSettings(
            memberRequest(organizationA),
            organizationB,
            updateDto,
          ),
        ).rejects.toMatchObject({ status: 403 });
        expect(
          mockOrganizationSettingsService.ensureForOrganization,
        ).not.toHaveBeenCalled();
        expect(mockOrganizationSettingsService.patch).not.toHaveBeenCalled();
      });

      it('patches the active organization for a member addressing it', async () => {
        mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
          mockOrganizationSettings,
        );
        mockOrganizationSettingsService.patch.mockResolvedValue(
          mockOrganizationSettings,
        );

        await controller.updateSettings(
          memberRequest(organizationA),
          organizationA,
          updateDto,
        );

        expect(
          organizationSettingsService.ensureForOrganization,
        ).toHaveBeenCalledWith(organizationA);
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

    describe('agent policy model override validation (#5228)', () => {
      const organizationId = testId('org');
      const textModelId = testId('text-model');
      const imageModelId = testId('image-model');

      const settingsWithAllowlist = {
        ...mockOrganizationSettings,
        agentPolicy: { thinkingModelOverride: null },
        enabledModelIds: [textModelId, imageModelId],
        organizationId,
      };

      beforeEach(() => {
        mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
          settingsWithAllowlist,
        );
        mockOrganizationSettingsService.patch.mockResolvedValue(
          settingsWithAllowlist,
        );
      });

      it('rejects an override key that is not an enabled model for its category', async () => {
        mockModelsService.findAvailableModels.mockResolvedValue([
          { category: 'text', id: textModelId, key: 'provider/text-model' },
        ]);

        await expect(
          controller.updateSettings(mockReq, organizationId, {
            agentPolicy: { thinkingModelOverride: 'unknown/not-enabled' },
          }),
        ).rejects.toMatchObject({ status: 400 });

        expect(organizationSettingsService.patch).not.toHaveBeenCalled();
      });

      it('rejects a key that is only enabled for a different override category', async () => {
        mockModelsService.findAvailableModels.mockResolvedValue([
          { category: 'image', id: imageModelId, key: 'provider/image-model' },
        ]);

        await expect(
          controller.updateSettings(mockReq, organizationId, {
            // A real, enabled model — but IMAGE, not TEXT — must not satisfy
            // the thinking override's category filter.
            agentPolicy: { thinkingModelOverride: 'provider/image-model' },
          }),
        ).rejects.toMatchObject({ status: 400 });

        expect(organizationSettingsService.patch).not.toHaveBeenCalled();
      });

      it('accepts an override key that matches an enabled model for its category', async () => {
        mockModelsService.findAvailableModels.mockResolvedValue([
          { category: 'text', id: textModelId, key: 'provider/text-model' },
        ]);

        await controller.updateSettings(mockReq, organizationId, {
          agentPolicy: { thinkingModelOverride: 'provider/text-model' },
        });

        expect(organizationSettingsService.patch).toHaveBeenCalledWith(
          settingsWithAllowlist.id,
          { agentPolicy: { thinkingModelOverride: 'provider/text-model' } },
        );
      });

      it('accepts an override key matched by id instead of key', async () => {
        mockModelsService.findAvailableModels.mockResolvedValue([
          { category: 'text', id: textModelId, key: 'provider/text-model' },
        ]);

        await controller.updateSettings(mockReq, organizationId, {
          agentPolicy: { thinkingModelOverride: textModelId },
        });

        expect(organizationSettingsService.patch).toHaveBeenCalled();
      });

      it('preserves an unchanged stored override without re-validating it against the catalog', async () => {
        mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
          {
            ...settingsWithAllowlist,
            agentPolicy: {
              thinkingModelOverride: 'stale-cuid-no-longer-in-catalog',
            },
          },
        );

        await controller.updateSettings(mockReq, organizationId, {
          agentPolicy: {
            thinkingModelOverride: 'stale-cuid-no-longer-in-catalog',
          },
        });

        expect(mockModelsService.findAvailableModels).not.toHaveBeenCalled();
        expect(organizationSettingsService.patch).toHaveBeenCalled();
      });

      it('does not validate when agentPolicy is not part of the patch', async () => {
        await controller.updateSettings(mockReq, organizationId, {
          isWhitelabelEnabled: true,
        });

        expect(mockModelsService.findAvailableModels).not.toHaveBeenCalled();
        expect(organizationSettingsService.patch).toHaveBeenCalled();
      });

      it('validates against the enabledModelIds being saved in the same request, not the stored allowlist', async () => {
        mockModelsService.findAvailableModels.mockResolvedValue([
          { category: 'text', id: textModelId, key: 'provider/text-model' },
        ]);

        await expect(
          controller.updateSettings(mockReq, organizationId, {
            // The new allowlist no longer includes the text model.
            agentPolicy: { thinkingModelOverride: 'provider/text-model' },
            enabledModelIds: [imageModelId],
          }),
        ).rejects.toMatchObject({ status: 400 });
      });
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
        memberRequest(organizationId),
        organizationId,
        { event: 'target.published' },
      );

      expect(mockWebhookDispatchService.sendTestDelivery).toHaveBeenCalledWith({
        event: 'target.published',
        organizationId,
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
          memberRequest(organizationId),
          organizationId,
          { event },
        );

        expect(
          mockWebhookDispatchService.sendTestDelivery,
        ).toHaveBeenCalledWith({
          event,
          organizationId,
        });
        expect(result.data.event).toBe(event);
      },
    );

    it('rejects a test delivery for an organization other than the active one', async () => {
      await expect(
        controller.testWebhookDelivery(
          memberRequest(organizationA),
          organizationB,
          { event: 'target.published' },
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        mockWebhookDispatchService.sendTestDelivery,
      ).not.toHaveBeenCalled();
    });
  });

  describe('BYOK routes', () => {
    it("rejects a member reading another organization's BYOK status", async () => {
      await expect(
        controller.getByokAllProviders(
          memberRequest(organizationA),
          organizationB,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(mockByokService.getStatus).not.toHaveBeenCalled();
    });

    it('saves a superadmin BYOK key on the URL organization', async () => {
      await controller.saveByokProviderKey(
        superAdminRequest(organizationA),
        organizationB,
        ByokProvider.OPENAI,
        { apiKey: ' sk-test ' },
      );

      expect(mockByokService.saveKey).toHaveBeenCalledWith(
        organizationB,
        ByokProvider.OPENAI,
        'sk-test',
        undefined,
      );
    });
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

    it('rejects brand lookups outside the active organization', async () => {
      await expect(
        controller.getFleetCapabilities(
          memberRequest(organizationA),
          organizationB,
          brandId,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(mockBrandsService.findOne).not.toHaveBeenCalled();
    });
  });
});
