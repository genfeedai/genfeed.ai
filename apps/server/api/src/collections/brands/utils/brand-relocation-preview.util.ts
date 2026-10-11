import {
  FIRST_ORDER_TARGETS,
  SECOND_ORDER_TARGETS,
} from '@api/collections/brands/constants/brand-org-cascade.constants';
import { RELOCATION_RESOURCE_LABELS } from '@api/collections/brands/constants/brand-relocation-labels.constant';
import {
  type CascadeDelegate,
  resolveSecondOrderFilters,
  type SecondOrderParentIds,
} from '@api/collections/brands/utils/brand-relocation-cascade.util';
import type { Prisma } from '@genfeedai/prisma';

export interface BrandRelocationMovingResource {
  resource: string;
  label: string;
  count: number;
}

function toMovingResource(
  resource: string,
  count: number,
): BrandRelocationMovingResource | null {
  if (count <= 0) {
    return null;
  }
  const labels = RELOCATION_RESOURCE_LABELS[resource];
  const words = resource.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const label = labels
    ? count === 1
      ? labels.singular
      : labels.plural
    : `${words} ${count === 1 ? 'record' : 'records'}`;
  return { count, label, resource };
}

/**
 * Every non-zero resource type whose organization the relocation rewrites,
 * counted before the move for the preview. First-order tables are counted by
 * their brand key; second-order children by the parents the brand owns.
 */
export async function countRelocationMovingResources(
  client: Prisma.TransactionClient,
  brandId: string,
  destOrgId: string,
): Promise<BrandRelocationMovingResource[]> {
  const delegateClient = client as unknown as Record<string, CascadeDelegate>;
  const firstOrderResources = await Promise.all(
    FIRST_ORDER_TARGETS.map(async (target) => {
      const count = await delegateClient[target.delegate].count({
        where: {
          [target.brandField]: brandId,
          [target.orgField]: { not: destOrgId },
        },
      });
      return toMovingResource(target.delegate, count);
    }),
  );

  const secondOrderResources: (BrandRelocationMovingResource | null)[] = [];
  const parentIds: SecondOrderParentIds = new Map();
  for (const child of SECOND_ORDER_TARGETS) {
    const groups = await resolveSecondOrderFilters(
      delegateClient,
      child,
      brandId,
      parentIds,
    );
    // A child that points at several parents is counted once: each parent's
    // rows exclude the rows an earlier parent already claimed.
    const claimed: Record<string, unknown>[] = [];
    let count = 0;
    for (const filters of groups) {
      for (const filter of filters) {
        count += await delegateClient[child.delegate].count({
          where: {
            ...filter,
            [child.orgField]: { not: destOrgId },
            ...(claimed.length > 0 ? { NOT: { OR: claimed } } : {}),
          },
        });
      }
      claimed.push(...filters);
    }
    secondOrderResources.push(toMovingResource(child.delegate, count));
  }

  return [...firstOrderResources, ...secondOrderResources].filter(
    (resource): resource is BrandRelocationMovingResource => resource !== null,
  );
}
