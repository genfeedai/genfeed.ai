import type { ITrendVideo } from '@genfeedai/interfaces';
import type { TrendItem } from '@props/trends/trends-page.props';

export interface TrendCardProps {
  trend: TrendItem;
  onCreateContent: (trend: TrendItem) => void;
}

export interface ViralVideoCardProps {
  video: ITrendVideo;
  isSelected: boolean;
  onToggleSelect: (videoId: string) => void;
  onHookRemix: (video: ITrendVideo) => void;
}

export interface ViralVideoToolbarProps {
  selectedCount: number;
  onBatchRemix: () => void;
  isDisabled: boolean;
}

export interface ScrapeCreatorInputProps {
  onScrape: (url: string) => void;
  isLoading: boolean;
}
