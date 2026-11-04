type AuthorizedSignalsStateEvidence = {
  key: string;
  provenance: string;
  status: string;
};

export type AuthorizedSignalsSnapshotState =
  | 'empty'
  | 'full'
  | 'partial'
  | 'stale';

/**
 * Snapshot state from platform-verified evidence only: all stale is `stale`,
 * an empty primary snapshot with nothing failed is `empty`, anything fully
 * available or empty is `full`, and the rest is `partial`.
 *
 * @param primaryKey Evidence key whose `empty` status makes the whole
 * snapshot `empty` (the owned posts/media/uploads/videos snapshot).
 */
export function resolveAuthorizedSignalsSnapshotState(
  evidence: readonly AuthorizedSignalsStateEvidence[],
  primaryKey: string,
): AuthorizedSignalsSnapshotState {
  const platformEvidence = evidence.filter(
    (item) => item.provenance === 'platform_verified',
  );

  if (platformEvidence.every((item) => item.status === 'stale')) {
    return 'stale';
  }

  const hasNoFailures = platformEvidence.every((item) =>
    ['available', 'empty'].includes(item.status),
  );
  const primary = platformEvidence.find((item) => item.key === primaryKey);
  if (primary?.status === 'empty' && hasNoFailures) {
    return 'empty';
  }

  return hasNoFailures ? 'full' : 'partial';
}
