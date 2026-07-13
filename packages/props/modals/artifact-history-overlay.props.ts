/**
 * Props for the artifact-history overlay (temporary conversation-shell overlay).
 *
 * Models the version-pin + approval contract from
 * `.agents/memory/architecture/ADR-CONVERSATION-SHELL-CONTRACTS.md`:
 * approval is a typed user decision bound to one immutable version pin, the
 * current version is immutable, and any revision mints a new version. A version
 * pin references an existing canonical record — it is not a duplicate artifact
 * store.
 */

export interface ArtifactVersionPin {
  /** Content digest for the pinned state (e.g. `Asset.sha256`), when available. */
  digest?: string;
  /** Stable, server-issued version-pin identity. */
  id: string;
  /** True for the single current version approval binds to. */
  isCurrent: boolean;
  /**
   * Immutable version pins cannot be edited in place; a revision mints a new
   * version. The current version is always immutable.
   */
  isImmutable: boolean;
  /** Short rail label, e.g. `v3`. */
  label: string;
  /**
   * Immutable canonical record version id when the underlying record supports
   * one; otherwise the server-issued pin id acts as the identity.
   */
  recordVersion?: string;
  /** One-line context beneath the title, e.g. `Approved scope ready`. */
  subtitle: string;
  /** Lifecycle heading, e.g. `Current · immutable`, `Previous`, `Initial`. */
  title: string;
}

export interface ArtifactHistoryOverlayProps {
  /** Id of the current immutable version approval binds to. */
  currentVersionId: string;
  /** Whether the overlay is mounted and visible. */
  isOpen: boolean;
  /** Approval decision in flight — disables the Approve CTA. */
  isApproving: boolean;
  /** Approve the current immutable version pin (`currentVersionId`). */
  onApprove: (versionId: string) => void;
  /** Open a prior version read-only for history inspection. */
  onOpenVersion: (versionId: string) => void;
  /** Overlay open/close transitions (scrim click, Escape, Close action). */
  onOpenChange: (isOpen: boolean) => void;
  /** Ordered newest-first; the current immutable version is first. */
  versions: ArtifactVersionPin[];
}
