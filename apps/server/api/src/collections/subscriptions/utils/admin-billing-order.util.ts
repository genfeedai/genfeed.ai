import { handleAllowedQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { Prisma } from '@genfeedai/prisma';

/**
 * Columns the superadmin billing list can be ordered by. Only the
 * organization's own columns qualify: tier, status, balance and usage are
 * assembled from other tables for the page after it is read, so ordering the
 * page by them would only reorder the rows already on screen.
 */
export const ADMIN_BILLING_SORT_FIELDS: readonly string[] = [
  'organizationName',
  'ownerEmail',
];

/**
 * The `orderBy` for the superadmin billing list: the requested column, then
 * newest first, then id, so rows with equal values keep a stable page order.
 * An unknown or missing sort falls back to newest first.
 */
export function buildAdminBillingOrderBy(
  sort: string | undefined,
): Prisma.OrganizationOrderByWithRelationInput[] {
  const requested = handleAllowedQuerySort(sort, ADMIN_BILLING_SORT_FIELDS, {});

  const requestedOrder = Object.entries(requested).map(
    ([field, direction]): Prisma.OrganizationOrderByWithRelationInput => {
      const order = direction === 1 ? 'asc' : 'desc';
      return field === 'ownerEmail'
        ? { user: { email: { nulls: 'last', sort: order } } }
        : { label: order };
    },
  );

  return [...requestedOrder, { createdAt: 'desc' }, { id: 'asc' }];
}
