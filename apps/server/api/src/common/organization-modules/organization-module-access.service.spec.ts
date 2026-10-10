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

function createService(
  moduleOverrides: unknown = {},
  isReleasePreviewEnabled = true,
) {
  const prisma = {
    organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
    organizationSetting: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ isReleasePreviewEnabled, moduleOverrides }),
    },
  };
  const paidAccess = {
    isSubscriptionGatedFresh: vi.fn().mockResolvedValue(false),
  };
  const service = new OrganizationModuleAccessService(
    prisma as never,
    paidAccess as never,
  );
  return { service, prisma, paidAccess };
}

describe('OrganizationModuleAccessService', () => {
  beforeEach(() => config.hasOrganizationBilling.mockReturnValue(true));

  it('skips optional background fills for disabled or unverifiable access while admitting enabled work', async () => {
    const { service, prisma } = createService({ analytics: false });
    await expect(service.canStartWork('org-1', 'analytics')).resolves.toBe(
      false,
    );
    prisma.organizationSetting.findUnique.mockRejectedValueOnce(
      new Error('offline'),
    );
    await expect(service.canStartWork('org-1', 'analytics')).resolves.toBe(
      false,
    );
    prisma.organizationSetting.findUnique.mockResolvedValue({
      moduleOverrides: { analytics: true },
    });
    await expect(service.canStartWork('org-1', 'analytics')).resolves.toBe(
      true,
    );
  });

  it('blocks default-off Batch without consulting balances or paid grants', async () => {
    const { service, prisma, paidAccess } = createService();
    await expect(service.assertAccess('org-1', 'batch')).rejects.toMatchObject({
      status: 403,
    });
    expect(prisma.organization.findFirst).toHaveBeenCalledWith({
      where: { id: 'org-1', isDeleted: false },
      select: { id: true },
    });
    expect(prisma.organizationSetting.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: { isReleasePreviewEnabled: true, moduleOverrides: true },
    });
    expect(paidAccess.isSubscriptionGatedFresh).not.toHaveBeenCalled();
  });

  it.each(['motion', 'clips', 'editor', 'automation', 'messages'] as const)(
    'refuses new %s work on cloud outside release preview (#5502)',
    async (moduleId) => {
      const { service, paidAccess } = createService(
        { [moduleId]: true },
        false,
      );
      await expect(
        service.assertAccess('org-1', moduleId),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'ORGANIZATION_MODULE_UNRELEASED',
          moduleId,
        }),
        status: 403,
      });
      await expect(service.canStartWork('org-1', moduleId)).resolves.toBe(
        false,
      );
      expect(paidAccess.isSubscriptionGatedFresh).not.toHaveBeenCalled();
    },
  );

  it('keeps reads and exports of unreleased modules available', async () => {
    const { service, prisma } = createService({ automation: true }, false);
    await expect(
      service.assertAccess('org-1', 'automation', 'read'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAccess('org-1', 'automation', 'export'),
    ).resolves.toBeUndefined();
    expect(prisma.organizationSetting.findUnique).not.toHaveBeenCalled();
  });

  it('does not apply the release gate to self-hosted deployments', async () => {
    config.hasOrganizationBilling.mockReturnValue(false);
    const { service } = createService({}, false);
    await expect(
      service.assertAccess('org-1', 'motion'),
    ).resolves.toBeUndefined();
  });
  it('allows an explicitly enabled credit-based module without a subscription', async () => {
    const { service, paidAccess } = createService({ batch: true });
    await expect(
      service.assertAccess('org-1', 'batch'),
    ).resolves.toBeUndefined();
    expect(paidAccess.isSubscriptionGatedFresh).not.toHaveBeenCalled();
  });
  it('uses a fresh canonical paid grant for subscription-only work', async () => {
    const { service, paidAccess } = createService({ automation: true });
    await expect(
      service.assertAccess('org-1', 'automation'),
    ).resolves.toBeUndefined();
    paidAccess.isSubscriptionGatedFresh.mockResolvedValueOnce(true);
    await expect(
      service.assertAccess('org-1', 'automation'),
    ).rejects.toMatchObject({ status: 403 });
    expect(paidAccess.isSubscriptionGatedFresh).toHaveBeenCalledTimes(2);
  });
  it('reads current module preferences for each admission, including after disabling a warm module', async () => {
    const { service, prisma } = createService({ batch: true });
    await service.assertAccess('org-1', 'batch');
    prisma.organizationSetting.findUnique.mockResolvedValueOnce({
      moduleOverrides: { batch: false },
    });
    await expect(service.assertAccess('org-1', 'batch')).rejects.toMatchObject({
      status: 403,
    });
    expect(prisma.organizationSetting.findUnique).toHaveBeenCalledTimes(2);
  });
  it('fails closed for missing/deleted organizations and missing settings', async () => {
    const { service, prisma } = createService({ batch: true });
    prisma.organization.findFirst.mockResolvedValueOnce(null);
    await expect(service.assertAccess('org-1', 'batch')).rejects.toMatchObject({
      status: 503,
    });
    expect(prisma.organizationSetting.findUnique).not.toHaveBeenCalled();
    prisma.organizationSetting.findUnique.mockResolvedValueOnce(null);
    await expect(service.assertAccess('org-1', 'batch')).rejects.toMatchObject({
      status: 503,
    });
  });
  it('fails closed on policy corruption, DB failures and entitlement uncertainty', async () => {
    const { service, prisma, paidAccess } = createService({ batch: 'true' });
    await expect(service.assertAccess('org-1', 'batch')).rejects.toMatchObject({
      status: 503,
    });
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
    prisma.organizationSetting.findUnique.mockResolvedValueOnce({
      moduleOverrides: {},
    });
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
  it('keeps self-hosted modules available without org billing while honoring explicit off preferences', async () => {
    config.hasOrganizationBilling.mockReturnValue(false);
    const { service, prisma, paidAccess } = createService();
    await expect(
      service.assertAccess('org-1', 'automation'),
    ).resolves.toBeUndefined();
    expect(paidAccess.isSubscriptionGatedFresh).not.toHaveBeenCalled();
    prisma.organizationSetting.findUnique.mockResolvedValueOnce({
      moduleOverrides: { automation: false },
    });
    await expect(
      service.assertAccess('org-1', 'automation'),
    ).rejects.toMatchObject({ status: 403 });
  });
});
