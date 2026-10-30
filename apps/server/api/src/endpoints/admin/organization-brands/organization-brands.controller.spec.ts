import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminOrganizationBrandsController } from '@api/endpoints/admin/organization-brands/organization-brands.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

const request = { context: { userId: 'operator' } } as never;

function createController() {
  const brandsService = {
    create: vi.fn().mockResolvedValue({
      id: 'brand-1',
      label: 'Gobl',
      slug: 'gobl',
    }),
    findOne: vi.fn().mockResolvedValue({
      id: 'brand-1',
      label: 'Gobl',
      slug: 'gobl',
      watermarkPosition: 'bottom-right',
    }),
    patch: vi.fn().mockResolvedValue({
      id: 'brand-1',
      label: 'Gobl',
      slug: 'gobl',
      watermarkPosition: 'top-right',
    }),
  };
  const signupPrefillService = {
    scanBrandUrl: vi.fn().mockResolvedValue({
      scrapeReason: undefined,
      scrapeStatus: 'scraped',
      summary: 'A summary',
    }),
  };
  const controller = new AdminOrganizationBrandsController(
    brandsService as never,
    signupPrefillService as never,
  );
  return { brandsService, controller, signupPrefillService };
}

describe('admin organization brands', () => {
  it('requires both IP allow-list and platform super-admin guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminOrganizationBrandsController),
    ).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it('creates a brand in the path organization, not the operator organization', async () => {
    const { brandsService, controller } = createController();
    const result = await controller.create(request, 'org-1', {
      label: 'Gobl',
    });

    expect(brandsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fontFamily: 'INTER_BOLD',
        label: 'Gobl',
        organizationId: 'org-1',
        userId: 'operator',
      }),
    );
    expect(result.data).toMatchObject({
      id: 'brand-1',
      organizationId: 'org-1',
    });
  });

  it('rejects unknown fields, bad fonts and missing labels before any write', async () => {
    const { brandsService, controller } = createController();
    for (const body of [
      {},
      { label: '' },
      { label: 'Gobl', organizationId: 'other' },
      { fontFamily: 'Inter', label: 'Gobl' },
    ]) {
      await expect(controller.create(request, 'org-1', body)).rejects.toThrow();
    }
    expect(brandsService.create).not.toHaveBeenCalled();
  });

  it('scans a brand that belongs to the path organization', async () => {
    const { brandsService, controller, signupPrefillService } =
      createController();
    const result = await controller.scan(request, 'org-1', 'brand-1', {
      url: 'https://www.gobl.world/',
    });

    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(signupPrefillService.scanBrandUrl).toHaveBeenCalledWith(
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'operator' },
      'https://www.gobl.world/',
    );
    expect(result.data).toMatchObject({ scrapeStatus: 'scraped' });
  });

  it('refuses to scan a brand outside the path organization', async () => {
    const { brandsService, controller, signupPrefillService } =
      createController();
    brandsService.findOne.mockResolvedValue(null);

    await expect(
      controller.scan(request, 'org-1', 'brand-9', { url: 'https://x.com/a' }),
    ).rejects.toThrow();
    expect(signupPrefillService.scanBrandUrl).not.toHaveBeenCalled();
  });

  it('rejects a missing operator identity', async () => {
    const { controller } = createController();
    await expect(
      controller.create({} as never, 'org-1', { label: 'Gobl' }),
    ).rejects.toThrow();
  });

  it('reads the kit fields of a brand in the path organization', async () => {
    const { brandsService, controller } = createController();
    const result = await controller.read('org-1', 'brand-1');
    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(result.data).toMatchObject({
      id: 'brand-1',
      organizationId: 'org-1',
      watermarkPosition: 'bottom-right',
    });
  });

  it('updates only the listed kit fields of a brand that belongs to the path organization', async () => {
    const { brandsService, controller } = createController();
    const result = await controller.update('org-1', 'brand-1', {
      watermarkPosition: 'top-right',
      watermarkText: null,
    });
    expect(brandsService.patch).toHaveBeenCalledWith('brand-1', {
      watermarkPosition: 'top-right',
      watermarkText: null,
    });
    expect(result.data.watermarkPosition).toBe('top-right');
  });

  it('rejects empty updates, unknown fields and a brand outside the organization before any write', async () => {
    const { brandsService, controller } = createController();
    for (const body of [
      {},
      { organizationId: 'other' },
      { watermarkOpacity: 2 },
      { watermarkPosition: 'middle' },
    ]) {
      await expect(
        controller.update('org-1', 'brand-1', body),
      ).rejects.toThrow();
    }
    brandsService.findOne.mockResolvedValue(null);
    await expect(
      controller.update('org-1', 'brand-9', { label: 'X' }),
    ).rejects.toThrow();
    expect(brandsService.patch).not.toHaveBeenCalled();
  });
});
