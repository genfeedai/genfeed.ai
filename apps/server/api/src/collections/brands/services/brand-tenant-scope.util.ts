import { scopedWhere } from '@api/tenancy/scoped-where';
import type { Prisma } from '@genfeedai/prisma';
import {
  crossOrgUnsafe,
  getTenantContext,
  isCrossOrgUnsafe,
} from '@libs/prisma/tenant-context';

/**
 * Brand.slug is globally unique (every organization, soft-deleted rows
 * included), so the collision lookup is cross-org by design.
 */
export function findBrandSlugHolder(
  delegate: { findFirst(args: Prisma.BrandFindFirstArgs): unknown },
  args: Prisma.BrandFindFirstArgs,
): Promise<unknown> {
  return crossOrgUnsafe(async () => await delegate.findFirst(args));
}

/**
 * `BaseService.patch(id)` writes by primary key alone, which the CLOUD tenant
 * guard rejects on a tenant model. Inside a request tenant the write is scoped
 * to that organization; with no tenant, or inside a relocation (cross-org),
 * `undefined` keeps the id-only write.
 */
export function tenantScopedBrandWhere(id: string) {
  const organizationId = getTenantContext()?.organizationId;
  return organizationId && !isCrossOrgUnsafe()
    ? scopedWhere(organizationId, { id })
    : undefined;
}
