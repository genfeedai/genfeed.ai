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

function createService(moduleOverrides: unknown = {}) {
  const prisma = {
    organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
    organizationSetting: {
      findUnique: vi.fn().mockResolvedValue({ moduleOverrides }),
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
      select: { moduleOverrides: true },
    });
    expect(paidAccess.isSubscriptionGatedFresh).not.toHaveBeenCalled();
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
