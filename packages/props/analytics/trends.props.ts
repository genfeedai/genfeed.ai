import type { Timeframe } from '@genfeedai/enums';
import type {
  ITrendHashtag,
  ITrendSound,
  ITrendVideo,
} from '@genfeedai/interfaces';

export interface ViralVideoLeaderboardProps {
  videos: ITrendVideo[];
  isLoading?: boolean;
  timeframe?: Timeframe.H24 | Timeframe.H72 | Timeframe.D7;
  onTimeframeChange?: (
    timeframe: Timeframe.H24 | Timeframe.H72 | Timeframe.D7,
  ) => void;
  onVideoClick?: (video: ITrendVideo) => void;
  className?: string;
}

export interface TrendingHashtagsProps {
  hashtags: ITrendHashtag[];
  isLoading?: boolean;
  selectedPlatform?: string;
  onPlatformChange?: (platform: string) => void;
  onHashtagClick?: (hashtag: ITrendHashtag) => void;
  className?: string;
}

export interface TrendingSoundsProps {
  sounds: ITrendSound[];
  isLoading?: boolean;
  onSoundClick?: (sound: ITrendSound) => void;
  onPlaySound?: (sound: ITrendSound) => void;
  className?: string;
}

export interface PlatformTrendsTabsProps {
  selectedPlatform: string;
  onPlatformChange: (platform: string) => void;
  platforms?: string[];
  className?: string;
}
