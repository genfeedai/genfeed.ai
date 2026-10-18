import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ForbiddenException } from '@nestjs/common';

type ListTenant = ReturnType<
  typeof CollectionFilterUtil.resolveListOrganizationId
>;

/**
 * `allBrands` widens a Library read only as far as the caller's brand access:
 * owners, admins, self-hosted installs and superadmins see every brand; a
 * member assigned to specific brands (or none) sees only those.
 */
export async function resolveAllBrandsFilter(
  brandAccess: BrandAccessService | undefined,
  tenant: Pick<ListTenant, 'organizationId'>,
  user: User,
  isSuperAdmin: boolean,
): Promise<Record<string, unknown> | undefined> {
  if (isSuperAdmin) {
    return undefined;
  }

  const userId = user.userId || user.id;
  if (!userId || !tenant.organizationId || !brandAccess) {
    throw new ForbiddenException({
      detail: 'Access denied to this organization',
      title: 'Forbidden',
    });
  }

  // API-key identity travels with the actor so a key's role cap applies.
  const { brandIds } = await brandAccess.resolve({
    apiKeyId: user.apiKeyId,
    isApiKey: user.isApiKey,
    organizationId: tenant.organizationId,
    scopes: user.scopes,
    userId,
  });

  return brandIds === undefined ? undefined : { in: brandIds };
}
