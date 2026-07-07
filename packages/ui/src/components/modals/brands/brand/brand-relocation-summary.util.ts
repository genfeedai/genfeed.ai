import type { IBrandRelocationMovingResource } from '@genfeedai/services/social/brand-relocation.types';

function joinRelocationSummaryItems(items: string[]): string {
  if (items.length === 0) {
    return '';
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function buildMovingResourcesSummary(
  resources: readonly IBrandRelocationMovingResource[] | undefined,
): string | null {
  const items = (resources ?? [])
    .filter((resource) => resource.count > 0)
    .map((resource) => `${resource.count} ${resource.label}`);

  if (items.length === 0) {
    return null;
  }

  return `Also moving with it: ${joinRelocationSummaryItems(items)}.`;
}
