import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({
  hasOrganizationBilling: vi.fn(() => true),
}));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: config.hasOrganizationBilling,
}));

/** What the migration stores: today's released modules. */
const RELEASED_FLAGS = {
  release_analytics: true,
  release_discovery: true,
  release_publishing: true,
  release_turbo: true,
};

function createService(
  isReleasePreviewEnabled = false,
  flags: Record<string, boolean> = RELEASED_FLAGS,
) {
  const prisma = {
    organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
    organizationSetting: {
      findUnique: vi.fn().mockResolvedValue({ isReleasePreviewEnabled }),
    },
  };
  const paidAccess = {
    isSubscriptionGatedFresh: vi.fn().mockResolvedValue(false),
  };
  const platformSettings = {
    getFeatureSettings: vi.fn(async () => ({ flags })),
    getFeatureSettingsState: vi.fn(async () => ({
      isResolved: true,
      settings: { flags },
    })),
  };
  const service = new OrganizationModuleAccessService(
    prisma as never,
    paidAccess as never,
    platformSettings as never,
  );
  return { service, prisma, paidAccess, platformSettings };
}

describe('OrganizationModuleAccessService', () => {
  beforeEach(() => config.hasOrganizationBilling.mockReturnValue(true));

  it('reports a release item as released from Admin → Flags on cloud', async () => {
    const customer = createService(false, { release_motion: true });
    await expect(customer.service.isReleased('org-1', 'motion')).resolves.toBe(
      true,
    );
    expect(customer.prisma.organizationSetting.findUnique).toHaveBeenCalledWith(
      {
        where: { organizationId: 'org-1' },
        select: { isReleasePreviewEnabled: true, releasedItemIds: true },
      },
    );
    await expect(customer.service.isReleased('org-1', 'clipper')).resolves.toBe(
      false,
    );
  });

  it('opens only the items granted to one organization in the web app, while admitting every item', async () => {
    const { service, prisma } = createService(false, {});
    prisma.organizationSetting.findUnique.mockResolvedValue({
      isReleasePreviewEnabled: false,
      releasedItemIds: ['turbo'],
    });
    await expect(service.isReleased('org-1', 'turbo')).resolves.toBe(true);
    await expect(service.isReleased('org-1', 'motion')).resolves.toBe(false);
    await expect(
      service.assertAccess('org-1', 'turbo'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAccess('org-1', 'motion'),
    ).resolves.toBeUndefined();
  });

  it('releases everything to an organization on release preview', async () => {
    const preview = createService(true, {});
    await expect(preview.service.isReleased('org-1', 'clipper')).resolves.toBe(
      true,
    );
    const missing = createService(false, {});
    missing.prisma.organizationSetting.findUnique.mockResolvedValue(null);
    await expect(missing.service.isReleased('org-1', 'clipper')).resolves.toBe(
      false,
    );
  });

  it('treats self-hosted organizations as released without a read', async () => {
    config.hasOrganizationBilling.mockReturnValue(false);
    const { service, prisma } = createService(false, {});
    await expect(service.isReleased('org-1', 'motion')).resolves.toBe(true);
    expect(prisma.organizationSetting.findUnique).not.toHaveBeenCalled();
  });

  it('skips optional background fills for unverifiable access while admitting released work', async () => {
    const { service, prisma } = createService();
    prisma.organizationSetting.findUnique.mockRejectedValueOnce(
      new Error('offline'),
    );
    await expect(service.canStartWork('org-1', 'analytics')).resolves.toBe(
      false,
    );
    await expect(service.canStartWork('org-1', 'analytics')).resolves.toBe(
      true,
    );
  });

  it('admits work in a module the organization hides from its members', async () => {
    const { service, prisma, paidAccess } = createService();
    prisma.organizationSetting.findUnique.mockResolvedValue({
      isReleasePreviewEnabled: false,
      moduleOverrides: { playground: false, turbo: false },
    });
    await expect(
      service.assertAccess('org-1', 'playground'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAccess('org-1', 'turbo'),
    ).resolves.toBeUndefined();
    expect(prisma.organization.findFirst).toHaveBeenCalledWith({
      where: { id: 'org-1', isDeleted: false },
      select: { id: true },
    });
    expect(paidAccess.isSubscriptionGatedFresh).not.toHaveBeenCalled();
  });

  it('always admits Playground and Storyboard: they are never release items', async () => {
    const { service } = createService(false, {});
    await expect(
      service.assertAccess('org-1', 'playground'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAccess('org-1', 'storyboard'),
    ).resolves.toBeUndefined();
  });

  it.each(['motion', 'clipper', 'editor'] as const)(
    'admits new %s work on cloud while it is not released',
    async (moduleId) => {
      const { service } = createService();
      await expect(
        service.assertAccess('org-1', moduleId),
      ).resolves.toBeUndefined();
      await expect(service.canStartWork('org-1', moduleId)).resolves.toBe(true);
    },
  );

  it.each(['automation', 'messages'] as const)(
    'admits new %s work for a subscribed cloud organization while it is not released',
    async (moduleId) => {
      const { service } = createService();
      await expect(
        service.assertAccess('org-1', moduleId),
      ).resolves.toBeUndefined();
      await expect(service.canStartWork('org-1', moduleId)).resolves.toBe(true);
    },
  );

  it.each(['automation', 'messages'] as const)(
    'refuses new %s work without a subscription, released or not',
    async (moduleId) => {
      const { service, paidAccess } = createService(false, {
        [`release_${moduleId}`]: true,
      });
      paidAccess.isSubscriptionGatedFresh.mockResolvedValue(true);
      await expect(
        service.assertAccess('org-1', moduleId),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'ORGANIZATION_MODULE_SUBSCRIPTION_REQUIRED',
        }),
        status: 403,
      });
      const unreleased = createService();
      unreleased.paidAccess.isSubscriptionGatedFresh.mockResolvedValue(true);
      await expect(
        unreleased.service.assertAccess('org-1', moduleId),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'ORGANIZATION_MODULE_SUBSCRIPTION_REQUIRED',
        }),
        status: 403,
      });
    },
  );

  it('answers an unreleased module with 404 while its kill switch is off', async () => {
    const { service } = createService(false, { motion: false });
    await expect(service.assertAccess('org-1', 'motion')).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it('fails closed while the platform flags have never been read', async () => {
    const { service, platformSettings } = createService();
    platformSettings.getFeatureSettingsState.mockResolvedValueOnce({
      isResolved: false,
      settings: { flags: {} },
    });
    await expect(service.assertAccess('org-1', 'turbo')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ORGANIZATION_MODULE_UNAVAILABLE',
      }),
      status: 503,
    });
  });

  it('keeps reads and exports available without reading settings', async () => {
    const { service, prisma } = createService();
    await expect(
      service.assertAccess('org-1', 'automation', 'read'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAccess('org-1', 'automation', 'export'),
    ).resolves.toBeUndefined();
    expect(prisma.organizationSetting.findUnique).not.toHaveBeenCalled();
  });

  it('admits unreleased modules on self-hosted deployments', async () => {
    config.hasOrganizationBilling.mockReturnValue(false);
    const { service, paidAccess } = createService(false, {});
    await expect(
      service.assertAccess('org-1', 'motion'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAccess('org-1', 'automation'),
    ).resolves.toBeUndefined();
    expect(paidAccess.isSubscriptionGatedFresh).not.toHaveBeenCalled();
  });

  it('allows a released credit-based module without a subscription', async () => {
    const { service, paidAccess } = createService();
    await expect(
      service.assertAccess('org-1', 'turbo'),
    ).resolves.toBeUndefined();
    expect(paidAccess.isSubscriptionGatedFresh).not.toHaveBeenCalled();
  });

  it('uses a fresh canonical paid grant for subscription-only work', async () => {
    const { service, paidAccess } = createService(true);
    await expect(
      service.assertAccess('org-1', 'automation'),
    ).resolves.toBeUndefined();
    paidAccess.isSubscriptionGatedFresh.mockResolvedValueOnce(true);
    await expect(
      service.assertAccess('org-1', 'automation'),
    ).rejects.toMatchObject({ status: 403 });
    expect(paidAccess.isSubscriptionGatedFresh).toHaveBeenCalledTimes(2);
  });

  it('fails closed for missing/deleted organizations and missing settings', async () => {
    const { service, prisma } = createService();
    prisma.organization.findFirst.mockResolvedValueOnce(null);
    await expect(service.assertAccess('org-1', 'turbo')).rejects.toMatchObject({
      status: 503,
    });
    expect(prisma.organizationSetting.findUnique).not.toHaveBeenCalled();
    prisma.organizationSetting.findUnique.mockResolvedValueOnce(null);
    await expect(service.assertAccess('org-1', 'turbo')).rejects.toMatchObject({
      status: 503,
    });
  });

  it('fails closed on DB failures and entitlement uncertainty', async () => {
    const { service, prisma, paidAccess } = createService();
    prisma.organization.findFirst.mockRejectedValueOnce(
      new Error('private database detail'),
    );
    try {
      await service.assertAccess('org-1', 'discovery');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).not.toMatchObject({
        detail: 'private database detail',
      });
    }
    paidAccess.isSubscriptionGatedFresh.mockRejectedValueOnce(
      new Error('billing unavailable'),
    );
    await expect(
      service.assertAccess('org-1', 'discovery'),
    ).rejects.toMatchObject({ status: 503 });
  });

  it.each(['read', 'export'] as const)(
    'preserves %s even with unavailable billing/settings',
    async (operation) => {
      const { service, prisma, paidAccess } = createService();
      await expect(
        service.assertAccess('org-1', 'discovery', operation),
      ).resolves.toBeUndefined();
      expect(prisma.organization.findFirst).not.toHaveBeenCalled();
      expect(paidAccess.isSubscriptionGatedFresh).not.toHaveBeenCalled();
    },
  );

  it.each(['read', 'export', 'cancel', 'write'] as const)(
    'answers Storyboard %s with 404 while its kill switch is off',
    async (operation) => {
      const { service } = createService(false, { storyboard: false });
      await expect(
        service.assertAccess('org-1', 'storyboard', operation),
      ).rejects.toMatchObject({ status: 404 });
    },
  );

  it.each([
    { moduleId: 'turbo', flags: { ...RELEASED_FLAGS, turbo: false } },
    { moduleId: 'analytics', flags: { ...RELEASED_FLAGS, analytics: false } },
    { moduleId: 'publishing', flags: { ...RELEASED_FLAGS, publishing: false } },
    { moduleId: 'discovery', flags: { ...RELEASED_FLAGS, discovery: false } },
  ] as const)(
    'refuses new $moduleId work while its kill switch is off',
    async ({ moduleId, flags }) => {
      const { service } = createService(false, flags);
      await expect(service.canStartWork('org-1', moduleId)).resolves.toBe(
        false,
      );
    },
  );

  it('lets a superadmin through a switched-off module without lifting the subscription gate', async () => {
    const { service, paidAccess } = createService(false, {
      automation: false,
      storyboard: false,
    });
    await expect(
      service.assertAccess('org-1', 'storyboard', 'write', {
        isSuperAdmin: true,
      }),
    ).resolves.toBeUndefined();
    paidAccess.isSubscriptionGatedFresh.mockResolvedValue(true);
    await expect(
      service.assertAccess('org-1', 'automation', 'write', {
        isSuperAdmin: true,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ORGANIZATION_MODULE_SUBSCRIPTION_REQUIRED',
      }),
      status: 403,
    });
  });

  it('keeps Playground generation open with Studio switched off', async () => {
    const { service } = createService(false, { studio: false });
    await expect(
      service.assertAccess('org-1', 'playground'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAccess('org-1', 'playground', 'read'),
    ).resolves.toBeUndefined();
  });
});
