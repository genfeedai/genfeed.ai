import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { resolveAllBrandsFilter } from '@api/collections/ingredients/utils/library-brand-scope.util';
import type { PersonasQueryDto } from '@api/collections/personas/dto/personas-query.dto';
import { brandAvailabilityWhere } from '@api/collections/personas/utils/persona-availability.util';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { PrismaFindAllInput } from '@api/shared/services/base/base.service';
import { PersonaStatus } from '@genfeedai/contracts';
import type { Request } from 'express';

/**
 * Brands an `allBrands` read is limited to: every brand of the organization
 * for owners, admins and superadmins, otherwise the caller's assigned brands.
 * `undefined` means no restriction.
 */
export async function resolveAllowedPersonaBrandIds(
  brandAccess: BrandAccessService | undefined,
  query: PersonasQueryDto,
  user: User,
  request: Request,
): Promise<string[] | undefined> {
  const tenant = CollectionFilterUtil.resolveListOrganizationId(
    query,
    user,
    request,
  );
  const scope = await resolveAllBrandsFilter(
    brandAccess,
    tenant,
    user,
    getIsSuperAdmin(user, request),
  );
  const clauses = scope?.OR as
    | Array<{ brandId: { in: string[] } | null }>
    | undefined;
  return clauses?.find((clause) => clause.brandId !== null)?.brandId?.in;
}

export function buildPersonasFindAllQuery(
  user: User,
  query: PersonasQueryDto,
  allowedBrandIds?: string[],
): PrismaFindAllInput {
  const match: Record<string, unknown> = {
    isDeleted: query.isDeleted ?? false,
  };
  CollectionFilterUtil.applyAuthorizedTenantMatch(match, query, user);

  // Characters owned by the brand plus those shared to it, in one query.
  const isAllBrands = Boolean(query.allBrands) && !query.brandId;
  const brandId = isAllBrands ? undefined : match.brandId;
  delete match.brandId;
  if (typeof brandId === 'string') {
    match.AND = [brandAvailabilityWhere(brandId)];
  }
  if (isAllBrands) {
    if (allowedBrandIds !== undefined) {
      match.brandId = { in: allowedBrandIds };
    }
  }

  if (query.status) {
    match.status = query.status;
  }
  if (query.avatarProvider) {
    match.avatarProvider = query.avatarProvider;
  }
  if (query.assignedMember) {
    match.assignedMembers = { some: { id: query.assignedMember } };
  }

  if (query.isMentionable) {
    match.handle = { not: null };
    match.status =
      query.status && query.status !== PersonaStatus.ARCHIVED
        ? query.status
        : PersonaStatus.ACTIVE;
  }

  const prefix = query.q?.trim();
  if (prefix) {
    match.OR = [
      { handle: { startsWith: prefix.toLowerCase(), mode: 'insensitive' } },
      { label: { startsWith: prefix, mode: 'insensitive' } },
    ];
  }

  const input: PrismaFindAllInput & { grantedToBrandId?: string } = {
    orderBy: handleQuerySort(query.sort),
    where: match,
  };
  // Characters granted to the organization join the unfiltered brand list.
  const hasFilters = Boolean(
    query.status ||
      query.avatarProvider ||
      query.assignedMember ||
      query.isMentionable ||
      query.q?.trim(),
  );
  if (typeof brandId === 'string' && !hasFilters) {
    input.grantedToBrandId = brandId;
  }
  return input;
}
