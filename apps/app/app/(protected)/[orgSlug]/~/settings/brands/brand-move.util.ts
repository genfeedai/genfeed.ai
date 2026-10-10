import type { IBrandRelocationPreview } from '@genfeedai/services/social/brand-relocation.types';
import type {
  BrandMoveEntry,
  BrandMoveEntryStatus,
} from '@props/settings/brand-move.props';
import { buildMovingResourcesSummary } from '@ui/modals/brands/brand/brand-relocation-summary.util';

export const ONLY_BRAND_REASON =
  "An organization keeps at least one brand, so its last brand can't be moved.";

/**
 * An org keeps at least one brand. When the whole org is selected, the server
 * accepts every move except the last one, so flag that one up front instead
 * of letting it fail after the others have already moved.
 */
export function markOnlyBrandBlocked(
  entries: BrandMoveEntry[],
  sourceBrandCount: number | undefined,
): BrandMoveEntry[] {
  const readyIndexes = entries.flatMap((entry, index) =>
    entry.status === 'ready' ? [index] : [],
  );
  // Blocked brands stay behind, so the org only empties when every one of its
  // brands is ready to move.
  if (
    sourceBrandCount === undefined ||
    readyIndexes.length === 0 ||
    readyIndexes.length < sourceBrandCount
  ) {
    return entries;
  }

  const lastReadyIndex = readyIndexes[readyIndexes.length - 1];
  return entries.map((entry, index) =>
    index === lastReadyIndex
      ? { ...entry, reason: ONLY_BRAND_REASON, status: 'blocked' }
      : entry,
  );
}

export function describePreview(preview: IBrandRelocationPreview): string {
  const parts: string[] = [];
  const resources = buildMovingResourcesSummary(preview.movingResources);
  if (resources) {
    parts.push(resources);
  } else if (preview.counts.soleBrandWorkflows > 0) {
    const count = preview.counts.soleBrandWorkflows;
    parts.push(
      `${count} dedicated workflow${count === 1 ? '' : 's'} ${count === 1 ? 'moves' : 'move'} with it.`,
    );
  }

  const { staleMembers } = preview.counts;
  if (staleMembers > 0) {
    parts.push(
      `${staleMembers} member${staleMembers === 1 ? '' : 's'} will lose access.`,
    );
  }

  return parts.join(' ');
}

export function countByStatus(
  entries: readonly BrandMoveEntry[],
  status: BrandMoveEntryStatus,
): number {
  return entries.filter((entry) => entry.status === status).length;
}

export function summarizeBatch(entries: readonly BrandMoveEntry[]): string {
  const moved = countByStatus(entries, 'moved');
  const failed = countByStatus(entries, 'failed');
  const noun = (count: number) => (count === 1 ? 'brand' : 'brands');

  if (failed === 0) {
    return `Moved ${moved} ${noun(moved)}.`;
  }
  if (moved === 0) {
    return `Couldn't move ${failed} ${noun(failed)}.`;
  }
  return `Moved ${moved} ${noun(moved)}; ${failed} couldn't be moved.`;
}
