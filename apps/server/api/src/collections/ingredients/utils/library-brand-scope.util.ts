import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import type { Prisma } from '@genfeedai/prisma';
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

  // Unbranded assets are organization-shared, so a restricted member keeps
  // them alongside their assigned brands.
  return brandIds === undefined
    ? undefined
    : { OR: [{ brandId: { in: brandIds } }, { brandId: null }] };
}

/**
 * A resolved Library brand scope as a `where` clause: a brand id or `{ in }`
 * predicate narrows `brandId`; an `OR` branch (restricted all-brands) is
 * already a complete clause.
 */
export function libraryBrandWhere(
  scope: string | Record<string, unknown> | undefined,
): Prisma.IngredientWhereInput {
  if (!scope) {
    return {};
  }
  if (typeof scope === 'object' && 'OR' in scope) {
    return scope as Prisma.IngredientWhereInput;
  }
  return { brandId: scope } as Prisma.IngredientWhereInput;
}

/**
 * Cache-key segment for the access identity behind a Library read. `allBrands`
 * results depend on the caller's API-key role cap, so a session and a scoped
 * key of the same user must never share a cached payload.
 */
export function libraryCacheIdentity(requestUser: object | undefined): string {
  const user = requestUser as
    | Pick<User, 'apiKeyId' | 'isApiKey' | 'scopes'>
    | undefined;
  if (!user?.isApiKey) {
    return 'session';
  }
  return `key:${user.apiKeyId ?? 'unknown'}:${[...(user.scopes ?? [])].sort().join(',')}`;
}
