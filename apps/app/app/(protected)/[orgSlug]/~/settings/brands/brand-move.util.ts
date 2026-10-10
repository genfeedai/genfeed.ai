import type { IBrandRelocationPreview } from '@genfeedai/services/social/brand-relocation.types';
import type {
  BrandMoveEntry,
  BrandMoveEntryStatus,
  BrandMoveTranslate,
} from '@props/settings/brand-move.props';
import { buildMovingResourcesSummary } from '@ui/modals/brands/brand/brand-relocation-summary.util';

/**
 * An org keeps at least one brand. When the whole org is selected, the server
 * accepts every move except the last one, so flag that one up front instead
 * of letting it fail after the others have already moved.
 */
export function markOnlyBrandBlocked(
  entries: BrandMoveEntry[],
  sourceBrandCount: number | undefined,
  reason: string,
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
    index === lastReadyIndex ? { ...entry, reason, status: 'blocked' } : entry,
  );
}

export function describePreview(
  preview: IBrandRelocationPreview,
  translate: BrandMoveTranslate,
): string {
  const parts: string[] = [];
  // The moving-resources line is shared with the single-brand modal and its
  // labels come from the API.
  const resources = buildMovingResourcesSummary(preview.movingResources);
  if (resources) {
    parts.push(resources);
  } else if (preview.counts.soleBrandWorkflows > 0) {
    parts.push(
      translate('workflowsMove', { count: preview.counts.soleBrandWorkflows }),
    );
  }

  const { staleMembers } = preview.counts;
  if (staleMembers > 0) {
    parts.push(translate('membersWillLose', { count: staleMembers }));
  }

  return parts.join(' ');
}

export function countByStatus(
  entries: readonly BrandMoveEntry[],
  status: BrandMoveEntryStatus,
): number {
  return entries.filter((entry) => entry.status === status).length;
}

export function summarizeBatch(
  entries: readonly BrandMoveEntry[],
  translate: BrandMoveTranslate,
): string {
  const moved = countByStatus(entries, 'moved');
  const failed = countByStatus(entries, 'failed');

  if (failed === 0) {
    return translate('batchMoved', { count: moved });
  }
  if (moved === 0) {
    return translate('batchAllFailed', { count: failed });
  }
  return translate('batchPartial', { failed, moved });
}
