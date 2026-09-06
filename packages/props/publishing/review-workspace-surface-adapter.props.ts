import type { IBatchItem } from '@genfeedai/contracts/interfaces';

export interface ReviewWorkspaceSurfaceAdapterProps {
  activeItem: IBatchItem | null;
  isActioning: boolean;
  isSelected: boolean;
  onApprove: (itemId: string) => void;
  onAssign: (itemId: string, assigneeId: string) => void;
  onReject: (itemId: string, feedback?: string) => void;
  onRequestChanges: (itemId: string, feedback?: string) => void;
  onToggleSelect: (itemId: string) => void;
  onUnassign: (itemId: string) => void;
}
