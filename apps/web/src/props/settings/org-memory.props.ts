import type { OrgMemoryEntry } from '@genfeedai/contracts/interfaces/settings/org-memory.interface';

export interface EditMemoryDialogProps {
  /** The memory being corrected, or null while the dialog is closed. */
  entry: OrgMemoryEntry | null;
  onCorrected: () => void | Promise<void>;
  onOpenChange: (isOpen: boolean) => void;
}
