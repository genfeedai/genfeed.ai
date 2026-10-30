import type { ReviewPanelItem } from '@props/publishing/review-panel-item.props';

export type ReviewEvent = NonNullable<ReviewPanelItem['reviewEvents']>[number];

export interface ReviewDetailPanelAsideProps {
  browserTimezone: string;
  formattedCreatedDate: string;
  formattedScheduledDate: string | null;
  isActioning: boolean;
  isReady: boolean;
  isSelected: boolean;
  item: ReviewPanelItem;
  onApprove: (itemId: string) => void;
  onAssign: (itemId: string, assigneeId: string) => void;
  onReject: (itemId: string, feedback?: string) => void;
  onRequestChanges: (itemId: string, feedback?: string) => void;
  onToggleSelect: (itemId: string) => void;
  onUnassign: (itemId: string) => void;
  reviewEvents: ReviewEvent[];
  statusLabel: string;
}
