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
import { AgentPolicyOverridesService } from '@api/collections/organizations/services/agent-policy-overrides.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import {
  type AccessBootstrapCachePayload,
  AccessBootstrapCacheService,
} from '@api/common/services/access-bootstrap-cache.service';
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
import { RedisService } from '@libs/redis/redis.service';
import { BadRequestException } from '@nestjs/common';
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
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  const mockBrandsService = {
    findOne: vi.fn(),
  };

  const mockIngredientsService = {
    findAvatarImageById: vi.fn(),
  };

  const mockAgentPolicyOverridesService = {
    normalizeOverrides: vi.fn((settingsDto) => settingsDto),
    validateOverrides: vi.fn().mockResolvedValue(undefined),
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

  /**
   * In-memory Redis covering the commands AccessBootstrapCacheService uses, so
   * the real cache service runs against a warmed snapshot.
   */
  function createInMemoryRedis() {
    const values = new Map<string, string>();
    const sets = new Map<string, Set<string>>();
    const matches = (pattern: string, key: string) =>
      new RegExp(
        `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
      ).test(key);

    return {
      expire: vi.fn(async () => 1),
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      sadd: vi.fn(async (key: string, member: string) => {
        const members = sets.get(key) ?? new Set<string>();
        members.add(member);
        sets.set(key, members);
        return 1;
      }),
      scan: vi.fn(async (_cursor: string, _match: string, pattern: string) => [
        '0',
        [...values.keys()].filter((key) => matches(pattern, key)),
      ]),
      setex: vi.fn(async (key: string, _ttl: number, value: string) => {
        values.set(key, value);
        return 'OK';
      }),
      smembers: vi.fn(async (key: string) => [...(sets.get(key) ?? [])]),
      unlink: vi.fn(async (keys: string[]) => {
        for (const key of keys) {
          values.delete(key);
          sets.delete(key);
        }
        return keys.length;
      }),
    };
  }

  let redis: ReturnType<typeof createInMemoryRedis>;
  let accessBootstrapCacheService: AccessBootstrapCacheService;
  const bootstrapUserId = testId('user');
  const bootstrapSnapshot = {
    access: {},
    brands: [],
    currentUser: null,
    fleetCapabilities: null,
    settings: { defaultAvatarIngredientId: 'avatar-before-save' },
    streak: null,
  } as unknown as AccessBootstrapCachePayload;

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
    redis = createInMemoryRedis();

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
          provide: AgentPolicyOverridesService,
          useValue: mockAgentPolicyOverridesService,
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
        AccessBootstrapCacheService,
        {
          provide: RedisService,
          useValue: { getPublisher: () => redis },
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
    accessBootstrapCacheService = module.get(AccessBootstrapCacheService);
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
      mockOrganizationSettingsService.findOne.mockResolvedValue(
        mockOrganizationSettings,
      );

      await controller.getSettings(
        superAdminRequest(organizationA),
        organizationB,
      );

      expect(organizationSettingsService.findOne).toHaveBeenCalledWith({
        organizationId: organizationB,
      });
      expect(
        organizationSettingsService.ensureForOrganization,
      ).not.toHaveBeenCalled();
    });

    it('serializes the setting returned by the canonical get-or-create policy', async () => {
      mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
        mockOrganizationSettings,
      );

      const result = await controller.getSettings(
        memberRequest(organizationId),
        organizationId,
      );

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

    describe('agent policy model override delegation (#5228, #5317)', () => {
      const organizationId = testId('org');

      beforeEach(() => {
        mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
          mockOrganizationSettings,
        );
        mockOrganizationSettingsService.patch.mockResolvedValue(
          mockOrganizationSettings,
        );
      });

      // Normalization and catalog-validation behavior (whitespace preserve
      // rule, category checks, stale-override preserve rule, etc.) is unit
      // tested against AgentPolicyOverridesService directly in
      // agent-policy-overrides.service.spec.ts. This controller only needs to
      // prove it wires the extracted service correctly.
      it('normalizes the incoming settings before validating and persisting them', async () => {
        const rawSettingsDto = {
          agentPolicy: { thinkingModelOverride: '  provider/text-model  ' },
        };
        const normalizedSettingsDto = {
          agentPolicy: { thinkingModelOverride: 'provider/text-model' },
        };
        mockAgentPolicyOverridesService.normalizeOverrides.mockReturnValue(
          normalizedSettingsDto,
        );

        await controller.updateSettings(
          mockReq,
          organizationId,
          rawSettingsDto,
        );

        expect(
          mockAgentPolicyOverridesService.normalizeOverrides,
        ).toHaveBeenCalledWith(rawSettingsDto);
        expect(
          mockAgentPolicyOverridesService.validateOverrides,
        ).toHaveBeenCalledWith(mockOrganizationSettings, normalizedSettingsDto);
        expect(organizationSettingsService.patch).toHaveBeenCalledWith(
          mockOrganizationSettings.id,
          normalizedSettingsDto,
        );
      });

      it('rejects the save when override validation fails, without persisting', async () => {
        mockAgentPolicyOverridesService.validateOverrides.mockRejectedValueOnce(
          new BadRequestException(
            'thinkingModelOverride "unknown/not-enabled" is not an enabled model for its category',
          ),
        );

        await expect(
          controller.updateSettings(mockReq, organizationId, {
            agentPolicy: { thinkingModelOverride: 'unknown/not-enabled' },
          }),
        ).rejects.toMatchObject({ status: 400 });

        expect(organizationSettingsService.patch).not.toHaveBeenCalled();
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

  describe('bootstrap snapshot invalidation (#5416)', () => {
    async function warmBootstrapSnapshots(): Promise<void> {
      await accessBootstrapCacheService.set(
        bootstrapUserId,
        organizationA,
        bootstrapSnapshot,
      );
      await accessBootstrapCacheService.set(
        bootstrapUserId,
        organizationB,
        bootstrapSnapshot,
      );
    }

    async function expectOnlyOrganizationASnapshotDropped(): Promise<void> {
      await expect(
        accessBootstrapCacheService.get(bootstrapUserId, organizationA),
      ).resolves.toBeNull();
      await expect(
        accessBootstrapCacheService.get(bootstrapUserId, organizationB),
      ).resolves.toEqual(bootstrapSnapshot);
    }

    it('drops the saved organization bootstrap snapshot after a settings save', async () => {
      await warmBootstrapSnapshots();
      mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
        mockOrganizationSettings,
      );
      mockOrganizationSettingsService.patch.mockResolvedValue(
        mockOrganizationSettings,
      );

      await controller.updateSettings(
        memberRequest(organizationA),
        organizationA,
        { isWhitelabelEnabled: true },
      );

      await expectOnlyOrganizationASnapshotDropped();
    });

    it('keeps the snapshot when the settings save is rejected', async () => {
      await warmBootstrapSnapshots();

      await expect(
        controller.updateSettings(memberRequest(organizationA), organizationA, {
          enabledModelIds: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        accessBootstrapCacheService.get(bootstrapUserId, organizationA),
      ).resolves.toEqual(bootstrapSnapshot);
    });

    it('drops the snapshot after saving and removing a BYOK key', async () => {
      await warmBootstrapSnapshots();
      await controller.saveByokProviderKey(
        memberRequest(organizationA),
        organizationA,
        ByokProvider.OPENAI,
        { apiKey: 'sk-test' },
      );
      await expectOnlyOrganizationASnapshotDropped();

      await warmBootstrapSnapshots();
      await controller.removeByokProviderKey(
        memberRequest(organizationA),
        organizationA,
        ByokProvider.OPENAI,
      );
      await expectOnlyOrganizationASnapshotDropped();
    });

    it('drops the snapshot after recording a webhook test delivery', async () => {
      await warmBootstrapSnapshots();
      mockWebhookDispatchService.sendTestDelivery.mockResolvedValue({
        deliveryId: 'webhook-test:abc',
        event: 'target.published',
        isTest: true,
        status: 'queued',
      });

      await controller.testWebhookDelivery(
        memberRequest(organizationA),
        organizationA,
        { event: 'target.published' },
      );

      await expectOnlyOrganizationASnapshotDropped();
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
        isDeleted: false,
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
          isDeleted: false,
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
