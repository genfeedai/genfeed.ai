import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ITenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.types';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { isCloudDeployment } from '@genfeedai/config';
import { BRAND_HANDLE_TAKEN_MESSAGE } from '@genfeedai/contracts/constants';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { ConflictException, ForbiddenException } from '@nestjs/common';

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
  brandsService: Pick<BrandsService, 'findOne' | 'brandAccessService'>,
  brandId: string,
  user: User,
  readScope?: ITenantReadScope,
): Promise<BrandDocument> {
  return findSessionBrand(
    user,
    brandId,
    (organizationId) =>
      findAuthorizedBrand(brandsService, user, organizationId, brandId),
    readScope,
  );
}

/** {@link verifyBrandAccess} by handle, for `GET /brands/slug`. */
export function verifyBrandSlugAccess(
  brandsService: Pick<BrandsService, 'findOneBySlug' | 'brandAccessService'>,
  slug: string,
  user: User,
  readScope?: ITenantReadScope,
): Promise<BrandDocument> {
  return findSessionBrand(
    user,
    slug,
    (organizationId) =>
      findAuthorizedSlug(brandsService, user, organizationId, slug),
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
  brandsService: Pick<
    BrandsService,
    'findOne' | 'isSlugAvailable' | 'brandAccessService'
  >,
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

async function brandPredicate(
  service: Pick<BrandsService, 'brandAccessService'>,
  user: User,
  organizationId: string,
) {
  // The tenant-read policy has already authorized cross-tenant platform reads.
  if (!isCloudDeployment() || organizationId !== user.organizationId)
    return scopedWhere(organizationId, {});
  try {
    return await service.brandAccessService.predicate(user);
  } catch (error) {
    if (error instanceof ForbiddenException)
      return { organizationId, isDeleted: false, id: { in: [] } };
    throw error;
  }
}
async function findAuthorizedBrand(
  service: Pick<BrandsService, 'findOne' | 'brandAccessService'>,
  user: User,
  organizationId: string,
  id: string,
) {
  return service.findOne({
    AND: [await brandPredicate(service, user, organizationId), { id }],
  });
}
async function findAuthorizedSlug(
  service: Pick<BrandsService, 'findOneBySlug' | 'brandAccessService'>,
  user: User,
  organizationId: string,
  slug: string,
) {
  return service.findOneBySlug({
    AND: [await brandPredicate(service, user, organizationId), { slug }],
  });
}
