import { OrganizationsSettingsController } from '@api/collections/organizations/controllers/organizations-settings.controller';
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
import {
  getTenantContext,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { ForbiddenException } from '@nestjs/common';

describe('Organization settings authorized path reads (#6176)', () => {
  function setup() {
    const capture = vi.fn();
    const read = vi.fn(() =>
      lazyTenantResult(
        {
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
    const controller = Object.assign(
      Object.create(
        OrganizationsSettingsController.prototype,
      ) as OrganizationsSettingsController,
      {
        organizationSettingsService: {
          ensureForOrganization: ensure,
          findOne: read,
        },
        brandsService: { findOne: read },
        subscriptionsService: { findOne: read },
        byokService: { getStatus: byok },
      },
    );
    return { controller, capture, read, byok, ensure };
  }

  it('reads foreign settings without creating or patching them', async () => {
    const { controller, read, ensure } = setup();
    const response = await controller.getSettings(
      tenantReadRequest(adminUser),
      targetOrganizationId,
    );
    expect(response.data?.id).toBe('settings');
    expect(read).toHaveBeenCalledWith({ organizationId: targetOrganizationId });
    expect(ensure).not.toHaveBeenCalled();
  });

  it('returns 404 for missing foreign settings without self-healing', async () => {
    const ensure = vi.fn();
    const findOne = vi.fn().mockResolvedValue(null);
    const { controller } = setup();
    Object.assign(controller, {
      organizationSettingsService: { ensureForOrganization: ensure, findOne },
    });
    await expect(
      controller.getSettings(
        tenantReadRequest(adminUser),
        targetOrganizationId,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(findOne).toHaveBeenCalledWith({
      organizationId: targetOrganizationId,
    });
    expect(ensure).not.toHaveBeenCalled();
  });

  it.each([adminUser, memberUser])(
    'self-heals only the caller session organization',
    async (user) => {
      const { controller, ensure } = setup();
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
      const { controller, capture } = setup();
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
      const { controller, capture, read, byok } = setup();
      await expect(invoke(controller, memberUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(read).not.toHaveBeenCalled();
      expect(byok).not.toHaveBeenCalled();
      expect(capture).not.toHaveBeenCalled();
    });
    it('keeps a member read pinned to the session path', async () => {
      const { controller, capture } = setup();
      await invoke(controller, memberUser, sessionOrganizationId);
      expect(capture).toHaveBeenCalledWith({
        organizationId: sessionOrganizationId,
      });
    });
  });
});
