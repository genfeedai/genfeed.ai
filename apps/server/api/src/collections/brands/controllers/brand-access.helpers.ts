import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ITenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.types';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { BRAND_HANDLE_TAKEN_MESSAGE } from '@genfeedai/contracts/constants';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { ConflictException } from '@nestjs/common';

/**
 * Resolve a brand inside the caller's session organization, or 404.
 *
 * Default callers remain bound to the session organization. Policy-authorized
 * reads may supply an explicit data scope without replacing the principal. A miss
 * is 404 for everyone, matching base-crud.controller.ts, so the response never
 * confirms that the id exists elsewhere. A session without an organization
 * fails closed instead of issuing an unscoped read.
 */
export function verifyBrandAccess(
  brandsService: Pick<BrandsService, 'findOne'>,
  brandId: string,
  user: User,
  readScope?: ITenantReadScope,
): Promise<BrandDocument> {
  return findSessionBrand(
    user,
    brandId,
    (organizationId) =>
      brandsService.findOne(scopedWhere(organizationId, { id: brandId })),
    readScope,
  );
}

/** {@link verifyBrandAccess} by handle, for `GET /brands/slug`. */
export function verifyBrandSlugAccess(
  brandsService: Pick<BrandsService, 'findOneBySlug'>,
  slug: string,
  user: User,
  readScope?: ITenantReadScope,
): Promise<BrandDocument> {
  return findSessionBrand(
    user,
    slug,
    (organizationId) =>
      brandsService.findOneBySlug(scopedWhere(organizationId, { slug })),
    readScope,
  );
}

async function findSessionBrand(
  user: User,
  identifier: string,
  find: (organizationId: string) => Promise<BrandDocument | null>,
  readScope?: ITenantReadScope,
): Promise<BrandDocument> {
  const organizationId = readScope?.organizationId ?? user.organizationId;
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
 * The brand a relocation starts from. It need not live in the caller's session
 * org (an admin of both orgs, active in the destination, may pull a teammate's
 * brand in), so the lookup is cross-org. Authorization for the move itself is
 * the relocation service's assertCanRelocate (superadmin, or owner/admin of
 * both organizations).
 */
export function findBrandToRelocate(
  brandsService: Pick<BrandsService, 'findOne'>,
  brandId: string,
): Promise<BrandDocument | null> {
  return crossOrgUnsafe(
    async () => await brandsService.findOne({ id: brandId }),
  );
}
