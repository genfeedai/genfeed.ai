import { customLabels } from '@api/helpers/utils/pagination.util';
import { AssetScope } from '@genfeedai/contracts';
import type { PublicApiFilter } from '@libs/interfaces/query.interface';

/** A positive whole number from a query value, else the fallback. */
function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * The query and page of a public creator list. `highlighted` puts featured
 * creators first across every page, so a directory can page through everyone
 * without listing anyone twice. A page holds at most 100 creators.
 */
export function publicBrandListing(query: {
  isHighlighted?: string;
  limit?: string;
  page?: string;
  sortBy?: string;
}) {
  const where: PublicApiFilter = { isDeleted: false, scope: AssetScope.PUBLIC };
  if (query.isHighlighted === 'true') {
    where.isHighlighted = true;
  }
  const orderBy =
    query.sortBy === 'highlighted'
      ? [{ isHighlighted: 'desc' }, { createdAt: 'desc' }]
      : { createdAt: -1 };
  return {
    aggregate: { orderBy, where },
    options: {
      customLabels,
      limit: Math.min(positiveInt(query.limit, 10), 100),
      page: positiveInt(query.page, 1),
      pagination: true,
    },
  };
}
