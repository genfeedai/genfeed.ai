export interface OrgMemoryAuthor {
  email?: string | null;
  handle?: string | null;
  id: string;
  name?: string | null;
}

export interface OrgMemoryEntry {
  content?: string | null;
  createdAt?: string | Date;
  currentRevisionId?: string | null;
  id: string;
  kind?: string | null;
  promotedSkillId?: string | null;
  scope?: string | null;
  summary?: string | null;
  user?: OrgMemoryAuthor | null;
}

export interface EditMemoryDialogProps {
  /** The memory being corrected, or null while the dialog is closed. */
  entry: OrgMemoryEntry | null;
  onCorrected: () => void | Promise<void>;
  onOpenChange: (isOpen: boolean) => void;
}
