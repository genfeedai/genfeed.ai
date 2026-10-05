import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsSettingsController } from '@api/collections/organizations/controllers/organizations-settings.controller';
import { AgentPolicyOverridesService } from '@api/collections/organizations/services/agent-policy-overrides.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ByokService } from '@api/services/byok/byok.service';
import { WebhookDispatchService } from '@api/services/webhook-client/webhook-client.module';
import {
  adminUser,
  lazyTenantResult,
  memberUser,
  sessionOrganizationId,
  targetBrandId,
  targetOrganizationId,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { ByokProvider } from '@genfeedai/contracts';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/contracts/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import {
  getTenantContext,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

describe('Organization settings authorized path reads (#6176)', () => {
  async function setup(isMissingSettings = false) {
    const capture = vi.fn();
    const read = vi.fn(() =>
      lazyTenantResult(
        isMissingSettings
          ? null
          : {
              id: 'settings',
              organizationId: targetOrganizationId,
              isFleetEnabled: true,
            },
        capture,
      ),
    );
    const byok = vi.fn(() =>
      lazyTenantResult([{ provider: ByokProvider.OPENROUTER }], capture),
    );
    const ensure = vi.fn(() => read());
    const settingsService = { ensureForOrganization: ensure, findOne: read };
    const module = await Test.createTestingModule({
      controllers: [OrganizationsSettingsController],
      providers: [
        { provide: OrganizationSettingsService, useValue: settingsService },
        { provide: BrandsService, useValue: { findOne: read } },
        { provide: IngredientsService, useValue: {} },
        { provide: AgentPolicyOverridesService, useValue: {} },
        { provide: SUBSCRIPTIONS_SERVICE, useValue: { findOne: read } },
        { provide: ByokService, useValue: { getStatus: byok } },
        { provide: WebhookDispatchService, useValue: {} },
        { provide: AccessBootstrapCacheService, useValue: {} },
        {
          provide: LoggerService,
          useValue: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = module.get<OrganizationsSettingsController>(
      OrganizationsSettingsController,
    );
    return { controller, capture, read, byok, ensure };
  }

  it('reads foreign settings without creating or patching them', async () => {
    const { controller, read, ensure } = await setup();
    const response = await controller.getSettings(
      tenantReadRequest(adminUser),
      targetOrganizationId,
    );
    expect(response.data?.id).toBe('settings');
    expect(read).toHaveBeenCalledWith({ organizationId: targetOrganizationId });
    expect(ensure).not.toHaveBeenCalled();
  });

  it('returns 404 for missing foreign settings without self-healing', async () => {
    const { controller, ensure, read } = await setup(true);
    await expect(
      controller.getSettings(
        tenantReadRequest(adminUser),
        targetOrganizationId,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(read).toHaveBeenCalledWith({
      organizationId: targetOrganizationId,
    });
    expect(ensure).not.toHaveBeenCalled();
  });

  it.each([adminUser, memberUser])(
    'self-heals only the caller session organization',
    async (user) => {
      const { controller, ensure } = await setup();
      await controller.getSettings(
        tenantReadRequest(user),
        sessionOrganizationId,
      );
      expect(ensure).toHaveBeenCalledWith(sessionOrganizationId);
    },
  );

  describe.each([
    'settings',
    'fleet',
    'subscription',
    'byok',
    'byok-provider',
  ] as const)('%s', (route) => {
    function invoke(
      controller: OrganizationsSettingsController,
      user = adminUser,
      org = targetOrganizationId,
    ) {
      const request = tenantReadRequest(user);
      switch (route) {
        case 'settings':
          return controller.getSettings(request, org);
        case 'fleet':
          return controller.getFleetCapabilities(request, org, targetBrandId);
        case 'subscription':
          return controller.findOneSubscription(request, org);
        case 'byok':
          return controller.getByokAllProviders(request, org);
        case 'byok-provider':
          return controller.getByokProviderStatus(
            request,
            org,
            ByokProvider.OPENROUTER,
          );
      }
    }
    it('awaits lazy reads inside the authorized path organization and restores the caller scope', async () => {
      const { controller, capture } = await setup();
      await runWithTenantContext(
        { organizationId: sessionOrganizationId },
        async () => {
          await invoke(controller);
          expect(getTenantContext()).toEqual({
            organizationId: sessionOrganizationId,
          });
        },
      );
      expect(capture).toHaveBeenCalledWith({
        organizationId: targetOrganizationId,
      });
    });
    it('rejects a member foreign path before executing a read', async () => {
      const { controller, capture, read, byok } = await setup();
      await expect(invoke(controller, memberUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(read).not.toHaveBeenCalled();
      expect(byok).not.toHaveBeenCalled();
      expect(capture).not.toHaveBeenCalled();
    });
    it('keeps a member read pinned to the session path', async () => {
      const { controller, capture } = await setup();
      await invoke(controller, memberUser, sessionOrganizationId);
      expect(capture).toHaveBeenCalledWith({
        organizationId: sessionOrganizationId,
      });
    });
  });
});
