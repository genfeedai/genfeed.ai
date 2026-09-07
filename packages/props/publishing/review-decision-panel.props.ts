import type { ReviewPanelItem } from '@props/publishing/review-panel-item.props';

export interface ReviewDecisionPanelProps {
  feedback: string;
  isActioning: boolean;
  isReady: boolean;
  isSelected: boolean;
  item: ReviewPanelItem;
  onApprove: (itemId: string) => void;
  onReject: (itemId: string, feedback?: string) => void;
  onRequestChanges: (itemId: string, feedback?: string) => void;
  onToggleSelect: (itemId: string) => void;
  setFeedback: (value: string) => void;
}
