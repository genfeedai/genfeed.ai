import { getTenantContext, isCrossOrgUnsafe } from './tenant-context';

/**
 * Platform-default rows (`organizationId: null`) are shared by every tenant,
 * so a tenant-scoped read of them has no organization to prove. The CLOUD
 * tenant guard (`tenant-guard.ts`) counts only string organization ids, so a
 * bare `organizationId: null` filter throws `missing-organization-id` inside a
 * request. These helpers add the arm the guard recognises: platform rows plus
 * the active tenant's own rows, and never another organization's.
 */

export type PlatformTenantScopeArm = {
  OR: [{ organizationId: string }, { organizationId: null }];
};

type PlatformScopedWhere = {
  AND?: unknown;
  organizationId?: unknown;
};

/**
 * `OR: [{ organizationId }, { organizationId: null }]` for `organizationId`
 * (defaults to the active tenant context), or the plain platform-only filter
 * `{ organizationId: null }` when there is no organization to name (no tenant
 * context: background work and `crossOrgUnsafe` callers keep platform-only
 * reads exactly as before).
 *
 * Spread the result into a `where` that has no other `organizationId` / `OR`.
 */
export function platformOrTenantScope(
  organizationId?: string | null,
): PlatformTenantScopeArm | { organizationId: null } {
  const organization = organizationId ?? getTenantContext()?.organizationId;

  return organization
    ? { OR: [{ organizationId: organization }, { organizationId: null }] }
    : { organizationId: null };
}

/**
 * Guard proof for a read that must stay platform-only: an `AND` entry naming
 * the active tenant. The surrounding `organizationId: null` filter still
 * decides which rows match; this only tells the guard whose request it is.
 * Empty (no-op) without a tenant context.
 */
export function platformTenantProof(): PlatformTenantScopeArm[] {
  const organizationId = getTenantContext()?.organizationId;

  return organizationId
    ? [{ OR: [{ organizationId }, { organizationId: null }] }]
    : [];
}

/**
 * Narrows an arbitrary registry `where` to platform rows plus the active
 * tenant's rows. Left untouched when no tenant context is active, inside
 * `crossOrgUnsafe` (the caller asked for every organization), or when the
 * query already names a concrete organization.
 */
export function withPlatformTenantArm<T extends object>(where: T): T {
  if (isCrossOrgUnsafe()) {
    return where;
  }

  const organizationId = getTenantContext()?.organizationId;
  if (!organizationId) {
    return where;
  }

  const scoped: PlatformScopedWhere = where;
  const existing = scoped.organizationId;
  if (
    typeof existing === 'string' ||
    (typeof existing === 'object' &&
      existing !== null &&
      ('equals' in existing || 'in' in existing))
  ) {
    return where;
  }

  const arm: PlatformTenantScopeArm = {
    OR: [{ organizationId }, { organizationId: null }],
  };
  const existingAnd = scoped.AND;
  const and = Array.isArray(existingAnd)
    ? [...existingAnd, arm]
    : existingAnd
      ? [existingAnd, arm]
      : [arm];

  return { ...where, AND: and };
}
