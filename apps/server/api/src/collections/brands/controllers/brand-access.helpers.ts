import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { BRAND_HANDLE_TAKEN_MESSAGE } from '@genfeedai/contracts/constants';
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
    const brand = await brandsService.findOne({
      id: brandId,
      isDeleted: false,
    });
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
