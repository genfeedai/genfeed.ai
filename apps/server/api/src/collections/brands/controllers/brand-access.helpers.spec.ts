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

  it('returns a brand from the existing user-or-organization scope', async () => {
    const brandsService = createBrandsService();
    brandsService.findOne.mockResolvedValue(brand);

    await expect(
      verifyBrandAccess(brandsService, 'brand-1', user),
    ).resolves.toBe(brand);
    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      OR: [{ userId: 'user-1' }, { organizationId: 'organization-1' }],
    });
  });

  it('preserves forbidden behavior for a missing member brand', async () => {
    const brandsService = createBrandsService();
    brandsService.findOne.mockResolvedValue(null);

    await expect(
      verifyBrandAccess(brandsService, 'missing-brand', user),
    ).rejects.toMatchObject({
      response: {
        detail: 'Access denied to this brand',
        title: 'Forbidden',
      },
      status: HttpStatus.FORBIDDEN,
    });
  });

  it('preserves not-found behavior for a missing superadmin brand', async () => {
    const brandsService = createBrandsService();
    brandsService.findOne.mockResolvedValue(null);
    const superadmin: User = { ...user, isSuperAdmin: true };

    await expect(
      verifyBrandAccess(brandsService, 'missing-brand', superadmin),
    ).rejects.toMatchObject({
      response: {
        detail: 'Brand not found',
        title: 'Not Found',
      },
      status: HttpStatus.NOT_FOUND,
    });
  });
});
