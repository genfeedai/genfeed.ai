import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { BRAND_HANDLE_TAKEN_MESSAGE } from '@genfeedai/contracts/constants';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { ConflictException } from '@nestjs/common';

/**
 * Resolve a brand inside the caller's session organization, or 404.
 *
 * Tenancy is the session organization only: creating a brand never grants
 * access to it from another organization (a former org, a demo org). A miss
 * is 404 for everyone, matching base-crud.controller.ts, so the response never
 * confirms that the id exists elsewhere. A session without an organization
 * fails closed instead of issuing an unscoped read.
 */
export function verifyBrandAccess(
  brandsService: Pick<BrandsService, 'findOne'>,
  brandId: string,
  user: User,
): Promise<BrandDocument> {
  return findSessionBrand(user, brandId, (organizationId) =>
    brandsService.findOne(scopedWhere(organizationId, { id: brandId })),
  );
}

/** {@link verifyBrandAccess} by handle, for `GET /brands/slug`. */
export function verifyBrandSlugAccess(
  brandsService: Pick<BrandsService, 'findOneBySlug'>,
  slug: string,
  user: User,
): Promise<BrandDocument> {
  return findSessionBrand(user, slug, (organizationId) =>
    brandsService.findOneBySlug(scopedWhere(organizationId, { slug })),
  );
}

async function findSessionBrand(
  user: User,
  identifier: string,
  find: (organizationId: string) => Promise<BrandDocument | null>,
): Promise<BrandDocument> {
  const organizationId = user.organizationId;
  const brand = organizationId ? await find(organizationId) : null;

  if (!brand) {
    throw new NotFoundException('Brand', identifier);
  }

  return brand;
}

/**
 * Preflight for a PATCH that carries a handle (a no-op without one). Access
 * comes first, so a caller cannot learn which handles are taken through a
 * brand they cannot edit. Superadmins may edit any live brand, as the default
 * patch allows. Relocations skip this: the relocation service authorizes both
 * organizations, then checks the handle.
 */
export async function assertBrandHandleAvailable(
  brandsService: Pick<BrandsService, 'findOne' | 'isSlugAvailable'>,
  params: {
    brandId: string;
    isSuperAdmin: boolean;
    slug: string | undefined;
    user: User;
  },
): Promise<void> {
  const { brandId, isSuperAdmin, slug, user } = params;
  if (slug === undefined) {
    return;
  }
  if (isSuperAdmin) {
    // Superadmins may edit any live brand; their session org is unrelated.
    const brand = await crossOrgUnsafe(
      async () =>
        await brandsService.findOne({
          id: brandId,
          isDeleted: false,
        }),
    );
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
  } else {
    await verifyBrandAccess(brandsService, brandId, user);
  }

  if (!(await brandsService.isSlugAvailable(slug, brandId))) {
    throw new ConflictException(BRAND_HANDLE_TAKEN_MESSAGE);
  }
}

/**
 * The brand a relocation starts from. Superadmins may relocate any brand
 * (their session org is unrelated); everyone else starts from a brand in
 * their session org, like every other brand route. Authorization for the move
 * itself stays in the relocation service's assertCanRelocate.
 */
export function findBrandToRelocate(
  brandsService: Pick<BrandsService, 'findOne'>,
  user: User,
  brandId: string,
  isSuperAdmin: boolean,
): Promise<BrandDocument | null> {
  if (isSuperAdmin) {
    return crossOrgUnsafe(
      async () => await brandsService.findOne({ id: brandId }),
    );
  }

  return brandsService.findOne(
    scopedWhere(user.organizationId, { id: brandId }),
  );
}
