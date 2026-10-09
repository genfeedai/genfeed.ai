import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { hasOrganizationBilling } from '@genfeedai/config';
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
