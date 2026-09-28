import type { IBatchItem } from '@genfeedai/contracts/interfaces';
import type { ContextSidebarSelectionOrigin } from '@props/ui/context-sidebar.props';

export interface ReviewWorkspaceSurfaceAdapterProps {
  activeItem: IBatchItem | null;
  activeItemOrigin: ContextSidebarSelectionOrigin;
  isActioning: boolean;
  isSelected: boolean;
  onApprove: (itemId: string) => void;
  onAssign: (itemId: string, assigneeId: string) => void;
  onReject: (itemId: string, feedback?: string) => void;
  onRequestChanges: (itemId: string, feedback?: string) => void;
  onToggleSelect: (itemId: string) => void;
  onUnassign: (itemId: string) => void;
  /** Bumped on every row tap; each bump reveals the sidebar. */
  revealRequest: number;
}
