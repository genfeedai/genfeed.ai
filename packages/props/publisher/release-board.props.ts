import type { IReleaseGroup } from '@genfeedai/interfaces';

/** One Kanban column. Status → column mapping lives in `release-board.tsx`. */
export type ReleaseBoardColumnId =
  | 'draft'
  | 'failed'
  | 'published'
  | 'review'
  | 'scheduled';

export interface ReleaseBoardProps {
  browserTimezone: string;
  isLoading: boolean;
  loadError: boolean;
  onRefetch: () => void;
  releases: IReleaseGroup[];
}
