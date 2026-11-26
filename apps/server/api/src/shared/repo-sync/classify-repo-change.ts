import type { RepoSyncChange } from '@genfeedai/contracts/interfaces/admin/repo-sync.interface';

export interface RepoChangeFingerprints {
  /** Hash of the repo version the stored item was last loaded from. */
  base?: string;
  /** Hash of the stored item as it is now. Absent when nothing is stored. */
  local?: string;
  /** Hash of the repo item at the commit being compared. */
  repo: string;
}

/**
 * Compares three fingerprints: what the repo has now, what is stored, and what
 * the stored item was loaded from. Only an item nobody edited is `updated`;
 * an item edited here and changed in the repo is a `conflict` and is never
 * written without a decision.
 */
export function classifyRepoChange({
  base,
  local,
  repo,
}: RepoChangeFingerprints): RepoSyncChange {
  if (local === undefined) return 'new';
  if (local === repo) return 'unchanged';
  // Stored without a repo source: the same name was added by hand.
  if (base === undefined) return 'conflict';
  if (local === base) return 'updated';
  return repo === base ? 'edited' : 'conflict';
}
