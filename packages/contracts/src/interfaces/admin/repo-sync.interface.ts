/** How one item in a repository compares with the row stored in the database. */
export type RepoSyncChange =
  | 'new'
  | 'updated'
  | 'conflict'
  | 'edited'
  | 'unchanged';

/** The admin's choice for an item that was edited here and changed in the repo. */
export type RepoSyncDecision = 'mine' | 'repo';

export interface IRepoSyncItem {
  /** What a refresh would do with the item, or `unchanged`. */
  change: RepoSyncChange;
  /** The text of the repo file, for the diff. Absent when the repo no longer has it. */
  after?: string[];
  /** The stored text the diff is taken against. Absent for a new item. */
  before?: string[];
  /** The decision a live run applied to a conflict. */
  decision?: RepoSyncDecision;
  key: string;
  label: string;
  /** Path of the file in the repository, for the diff header. */
  path: string;
}

export interface IRepoSyncReview {
  /** Full SHA the comparison was made at. */
  commit: string;
  committedAt: string;
  dryRun: boolean;
  items: IRepoSyncItem[];
  repository: string;
  totals: Record<RepoSyncChange, number>;
}
