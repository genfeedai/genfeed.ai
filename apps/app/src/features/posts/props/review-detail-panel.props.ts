import type { ReviewPanelItem } from '@props/publishing/review-panel-item.props';

export interface ReviewDetailPanelProps {
  isActioning: boolean;
  isSelected: boolean;
  item: ReviewPanelItem | null;
  onApprove: (itemId: string) => void;
  onAssign: (itemId: string, assigneeId: string) => void;
  onReject: (itemId: string, feedback?: string) => void;
  onRequestChanges: (itemId: string, feedback?: string) => void;
  onToggleSelect: (itemId: string) => void;
  onUnassign: (itemId: string) => void;
}
