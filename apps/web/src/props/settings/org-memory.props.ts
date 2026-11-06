import type { IAgentMemoryRevision } from '@genfeedai/contracts/interfaces';
import type { OrgMemoryEntry } from '@genfeedai/contracts/interfaces/settings/org-memory.interface';

export interface EditMemoryDialogProps {
  /** The memory being corrected, or null while the dialog is closed. */
  entry: OrgMemoryEntry | null;
  onCorrected: () => void | Promise<void>;
  onOpenChange: (isOpen: boolean) => void;
}

/** One page of a memory's revision history, newest first. */
export interface MemoryRevisionPage {
  items: IAgentMemoryRevision[];
  nextCursor: string | null;
}

/**
 * Revisions fetched with "Load more" during one opening of the dialog, after
 * the first page they continue. A refreshed first page starts a new chain.
 */
export interface OlderRevisionPages extends MemoryRevisionPage {
  entryId: string | undefined;
  firstPage: MemoryRevisionPage | undefined;
}
