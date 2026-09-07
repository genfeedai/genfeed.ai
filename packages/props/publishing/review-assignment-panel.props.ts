import type { ReviewPanelItem } from '@props/publishing/review-panel-item.props';

export interface ReviewAssignmentMemberOption {
  id: string;
  label: string;
}

export interface ReviewAssignmentPanelProps {
  isActioning: boolean;
  item: ReviewPanelItem;
  onAssign: (itemId: string, assigneeId: string) => void;
  onUnassign: (itemId: string) => void;
}
