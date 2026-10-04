import type { PrismaFilter } from '@api/shared/services/base/base-query-normalization.adapter';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import {
  getTenantContext,
  isCrossOrgUnsafe,
} from '@libs/prisma/tenant-context';

/**
 * `read`  - queries that return rows: a tenant may see its own rows and, for
 *           platform-default models, the shared `organizationId: null` rows.
 * `write` - updates and soft deletes: a tenant only ever touches its own rows.
 *           Platform rows are mutated only by a superadmin path that opts out
 *           of tenant scoping explicitly (`crossOrgUnsafe`).
 */
export type TenantScopeAccess = 'read' | 'write';

/**
 * The single place that decides which tenant models legitimately hold
 * platform rows (`organizationId: null`) that every organization may read:
 * curated catalogs and shipped defaults. Every other tenant model is purely
 * tenant-owned, so a null-organization row there is an orphan and must never
 * be handed to a tenant.
 *
 * Keyed by Prisma model name. Which models are tenant models at all is NOT
 * decided here - that stays `isTenantScopedFieldSet` (organizationId +
 * isDeleted), the same inventory the runtime tenant guard enforces.
 */
export const PLATFORM_ROW_MODELS: ReadonlySet<string> = new Set([
  'ElementCamera',
  'ElementCameraMovement',
  'ElementLens',
  'ElementLighting',
  'ElementMood',
  'ElementScene',
  'ElementSound',
  'ElementStyle',
  'FontFamilyRecord',
  'Ingredient',
  'Model',
  'Preset',
  'Skill',
  'Tag',
  'Template',
  'Trend',
]);

// The runtime guard (`tenant-guard.ts`) walks the whole query args and gives up
// below depth 8, so a filter's own root sits at depth 1. Counting the same way
// keeps "this filter already proves the tenant" identical to what the guard
// will see.
const MAX_ORGANIZATION_SCOPE_DEPTH = 8;

function toPrismaModelName(modelName: string): string {
  return modelName.charAt(0).toUpperCase() + modelName.slice(1);
}

export function isPlatformRowModel(modelName: string): boolean {
  return PLATFORM_ROW_MODELS.has(toPrismaModelName(modelName));
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function organizationFilterNamesAnOrganization(value: unknown): boolean {
  if (isNonEmptyString(value)) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value.equals) ||
    (Array.isArray(value.in) && value.in.some(isNonEmptyString))
  );
}

/**
 * Mirrors what the runtime tenant guard counts as an organization proof
 * (including its depth limit, with `where` itself at depth 1): a
 * non-empty `organizationId` (direct, `equals` or `in`) in `where`, `AND` or
 * `OR`. `null` and `{ not }` filters are not proof. A caller that already
 * names an organization keeps full control of its scope, and the guard then
 * validates it against the request tenant.
 */
export function whereNamesOrganization(node: unknown, depth = 1): boolean {
  if (depth > MAX_ORGANIZATION_SCOPE_DEPTH || node == null) {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some((entry) => whereNamesOrganization(entry, depth + 1));
  }
  if (!isRecord(node)) {
    return false;
  }
  if (organizationFilterNamesAnOrganization(node.organizationId)) {
    return true;
  }
  return (
    whereNamesOrganization(node.AND, depth + 1) ||
    whereNamesOrganization(node.OR, depth + 1)
  );
}

function withAndClause(
  where: PrismaFilter,
  clause: PrismaFilter,
): PrismaFilter {
  const existing = where.AND;
  const entries = Array.isArray(existing)
    ? existing
    : existing
      ? [existing]
      : [];
  return { ...where, AND: [...entries, clause] };
}

/**
 * Adds the request tenant to a filter that names no organization.
 *
 * The tenant arm always lands at the top level of the filter (a sibling key,
 * or one more entry in the top-level `AND` array): the caller's own filter is
 * never nested deeper, so a proof it already carries stays visible to the
 * guard.
 *
 * No-op when there is no tenant context (workers, crons, webhooks), inside
 * `crossOrgUnsafe`, or when the caller already scoped the query. Callers
 * decide beforehand that `modelName` is a tenant model.
 */
export function scopeWhereToTenant(
  where: PrismaFilter,
  modelName: string,
  access: TenantScopeAccess,
): PrismaFilter {
  const tenant = getTenantContext();
  if (!tenant || isCrossOrgUnsafe() || whereNamesOrganization(where)) {
    return where;
  }

  const { organizationId } = tenant;

  if (access === 'read' && isPlatformRowModel(modelName)) {
    // A caller-supplied `organizationId: null` still narrows to platform rows;
    // the tenant arm is what proves the request's organization.
    return withAndClause(where, {
      OR: [{ organizationId: null }, { organizationId }],
    });
  }

  if (where.organizationId === undefined) {
    return { ...where, organizationId };
  }

  // The caller filtered on `organizationId: null` / `{ not }`; keep that
  // filter and add the tenant next to it instead of overwriting it.
  return withAndClause(where, { organizationId });
}
