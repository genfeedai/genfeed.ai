import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { HttpStatus } from '@nestjs/common';

import { verifyBrandAccess } from './brand-access.helpers';

describe('verifyBrandAccess', () => {
  const user: User = {
    brandId: 'brand-1',
    id: 'user-legacy',
    organizationId: 'organization-1',
    userId: 'user-1',
  };

  // The access helper only observes identity fields from the persisted row.
  const brand = {
    id: 'brand-1',
    organizationId: 'organization-1',
    userId: 'user-1',
  } as BrandDocument;

  function createBrandsService() {
    return {
      findOne: vi.fn<BrandsService['findOne']>(),
    };
  }

  const notFound = {
    response: expect.objectContaining({
      detail: "Brand with identifier 'brand-1' not found",
    }),
    status: HttpStatus.NOT_FOUND,
  };

  it('resolves the brand inside the session organization only', async () => {
    const brandsService = createBrandsService();
    brandsService.findOne.mockResolvedValue(brand);

    await expect(
      verifyBrandAccess(brandsService, 'brand-1', user),
    ).resolves.toBe(brand);
    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      isDeleted: false,
      organizationId: 'organization-1',
    });
  });

  it('lets a teammate reach a brand another member created in the session organization', async () => {
    const brandsService = createBrandsService();
    const teammateBrand = { ...brand, userId: 'user-2' } as BrandDocument;
    brandsService.findOne.mockResolvedValue(teammateBrand);

    await expect(
      verifyBrandAccess(brandsService, 'brand-1', user),
    ).resolves.toBe(teammateBrand);
  });

  it('does not reach a brand the caller created in another organization', async () => {
    const brandsService = createBrandsService();
    const foreignBrand = {
      ...brand,
      organizationId: 'organization-2',
    } as BrandDocument;
    // Emulate the database: the row resolves only for its own organization.
    brandsService.findOne.mockImplementation(async (where) =>
      (where as { organizationId?: string }).organizationId ===
      foreignBrand.organizationId
        ? foreignBrand
        : null,
    );

    await expect(
      verifyBrandAccess(brandsService, 'brand-1', user),
    ).rejects.toMatchObject(notFound);
    expect(brandsService.findOne).not.toHaveBeenCalledWith(
      expect.objectContaining({ OR: expect.anything() }),
    );
  });

  it('returns 404 rather than 403 on a member miss', async () => {
    const brandsService = createBrandsService();
    brandsService.findOne.mockResolvedValue(null);

    await expect(
      verifyBrandAccess(brandsService, 'brand-1', user),
    ).rejects.toMatchObject(notFound);
  });

  it('returns 404 on a superadmin miss', async () => {
    const brandsService = createBrandsService();
    brandsService.findOne.mockResolvedValue(null);
    const superadmin: User = { ...user, isSuperAdmin: true };

    await expect(
      verifyBrandAccess(brandsService, 'brand-1', superadmin),
    ).rejects.toMatchObject(notFound);
  });

  it('fails closed without a session organization', async () => {
    const brandsService = createBrandsService();
    brandsService.findOne.mockResolvedValue(brand);
    const orphan = { ...user, organizationId: '' } as User;

    await expect(
      verifyBrandAccess(brandsService, 'brand-1', orphan),
    ).rejects.toMatchObject(notFound);
    expect(brandsService.findOne).not.toHaveBeenCalled();
  });
});
