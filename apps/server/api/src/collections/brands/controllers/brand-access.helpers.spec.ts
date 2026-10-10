import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import { HttpStatus } from '@nestjs/common';

import {
  verifyBrandAccess,
  verifyBrandSlugAccess,
} from './brand-access.helpers';

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
      brandAccessService: brandAccessFixture(),
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

describe('explicit selected brand data scope', () => {
  const user: User = {
    id: 'actor',
    userId: 'actor',
    organizationId: 'original-org',
    brandId: 'original-brand',
    isSuperAdmin: true,
  };
  const scope = {
    organizationId: 'selected-org',
    isOrganizationOverride: true,
  };
  it('uses explicit read org for by-id and slug while keeping the original principal', async () => {
    const selected = {
      id: 'selected-brand',
      organizationId: 'selected-org',
    } as BrandDocument;
    const service = {
      brandAccessService: brandAccessFixture(),
      findOne: vi.fn<BrandsService['findOne']>().mockResolvedValue(selected),
      findOneBySlug: vi
        .fn<BrandsService['findOneBySlug']>()
        .mockResolvedValue(selected),
    };
    await expect(
      verifyBrandAccess(service, 'selected-brand', user, scope),
    ).resolves.toBe(selected);
    await expect(
      verifyBrandSlugAccess(service, 'selected', user, scope),
    ).resolves.toBe(selected);
    expect(service.findOne).toHaveBeenCalledWith({
      id: 'selected-brand',
      organizationId: 'selected-org',
      isDeleted: false,
    });
    expect(service.findOneBySlug).toHaveBeenCalledWith({
      slug: 'selected',
      organizationId: 'selected-org',
      isDeleted: false,
    });
    expect(user.organizationId).toBe('original-org');
  });
  it('keeps default write/unmarked callers constrained to the original org and404 misses', async () => {
    const service = {
      brandAccessService: brandAccessFixture(),
      findOne: vi.fn<BrandsService['findOne']>().mockResolvedValue(null),
    };
    await expect(
      verifyBrandAccess(service, 'selected-brand', user),
    ).rejects.toMatchObject({ status: 404 });
    expect(service.findOne).toHaveBeenCalledWith({
      id: 'selected-brand',
      organizationId: 'original-org',
      isDeleted: false,
    });
  });
});
