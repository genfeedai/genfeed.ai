import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: vi.fn(),
}));

describe('organization settings module runtime projection', () => {
  it.each([true, false])(
    'uses verified server billing %s and ignores a record-supplied hint',
    async (isBilling) => {
      vi.mocked(hasOrganizationBilling).mockReturnValue(isBilling);
      const row = {
        id: 'settings-1',
        organizationId: 'org-1',
        moduleOverrides: { automation: false },
        hasOrganizationBilling: !isBilling,
      };
      const findFirst = vi.fn().mockResolvedValue(row);
      const service = new OrganizationSettingsService(
        { organizationSetting: { findFirst } } as never,
        { debug: vi.fn(), error: vi.fn(), warn: vi.fn() } as never,
        {} as never,
        {} as never,
      );
      const result = await service.findOne({ organizationId: 'org-1' });
      expect(result).toMatchObject({
        id: 'settings-1',
        organizationId: 'org-1',
        hasOrganizationBilling: isBilling,
        moduleOverrides: { automation: false },
      });
      expect(findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
      });
      expect(row.hasOrganizationBilling).toBe(!isBilling);
    },
  );

  it('does not synthesize runtime access for missing settings', async () => {
    const service = new OrganizationSettingsService(
      {
        organizationSetting: { findFirst: vi.fn().mockResolvedValue(null) },
      } as never,
      { debug: vi.fn(), error: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      {} as never,
    );
    expect(await service.findOne({ organizationId: 'org-1' })).toBeNull();
  });
});

describe('readonly paid module eligibility', () => {
  const row = {
    id: 'settings-1',
    organizationId: 'org-1',
    moduleOverrides: {},
    hasPaidModuleSubscription: true,
  };
  function create(isGated: unknown, isRejected = false) {
    const fresh = isRejected
      ? vi.fn().mockRejectedValue(new Error('billing offline'))
      : vi.fn().mockResolvedValue(isGated);
    const get = vi.fn().mockReturnValue({ isSubscriptionGatedFresh: fresh });
    const service = new OrganizationSettingsService(
      {
        organizationSetting: { findFirst: vi.fn().mockResolvedValue(row) },
      } as never,
      { debug: vi.fn(), error: vi.fn(), warn: vi.fn() } as never,
      { get } as never,
      {} as never,
    );
    return { service, fresh, get };
  }
  it.each([true, false])(
    'projects a fresh canonical gated=%s result for the actual settings organization',
    async (isGated) => {
      vi.mocked(hasOrganizationBilling).mockReturnValue(true);
      const { service, fresh, get } = create(isGated);
      const result = await service.findOne({ organizationId: 'org-1' });
      expect(result?.hasPaidModuleSubscription).toBe(!isGated);
      expect(get).toHaveBeenCalledWith(OrganizationPaidAccessService, {
        strict: false,
      });
      expect(fresh).toHaveBeenCalledWith('org-1');
      expect(row.hasPaidModuleSubscription).toBe(true);
    },
  );
  it('keeps paid eligibility unavailable outside the active tenant without querying billing', async () => {
    vi.mocked(hasOrganizationBilling).mockReturnValue(true);
    const { service, fresh, get } = create(false);
    const result = await runWithTenantContext(
      { organizationId: 'selected-other-org' },
      () => service.findOne({ organizationId: 'org-1' }),
    );
    expect(result?.hasPaidModuleSubscription).toBeNull();
    expect(fresh).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('does not allow a forged row value to grant access when lookup fails', async () => {
    vi.mocked(hasOrganizationBilling).mockReturnValue(true);
    const { service } = create(false, true);
    const result = await service.findOne({ organizationId: 'org-1' });
    expect(result).toMatchObject({
      id: row.id,
      hasPaidModuleSubscription: null,
    });
  });
  it('keeps malformed canonical eligibility unknown', async () => {
    vi.mocked(hasOrganizationBilling).mockReturnValue(true);
    const { service } = create(undefined);
    expect(
      (await service.findOne({ organizationId: 'org-1' }))
        ?.hasPaidModuleSubscription,
    ).toBeNull();
  });
  it('rechecks a revoked paid grant on the next settings read', async () => {
    vi.mocked(hasOrganizationBilling).mockReturnValue(true);
    const { service, fresh } = create(false);
    fresh.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(
      (await service.findOne({ organizationId: 'org-1' }))
        ?.hasPaidModuleSubscription,
    ).toBe(true);
    expect(
      (await service.findOne({ organizationId: 'org-1' }))
        ?.hasPaidModuleSubscription,
    ).toBe(false);
    expect(fresh).toHaveBeenCalledTimes(2);
  });

  it('does not query paid eligibility when organization billing is off', async () => {
    vi.mocked(hasOrganizationBilling).mockReturnValue(false);
    const { service, fresh, get } = create(true);
    expect(
      (await service.findOne({ organizationId: 'org-1' }))
        ?.hasPaidModuleSubscription,
    ).toBe(true);
    expect(get).not.toHaveBeenCalled();
    expect(fresh).not.toHaveBeenCalled();
  });
});
