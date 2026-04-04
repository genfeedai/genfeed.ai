import type {
  ITrendHashtag,
  ITrendSound,
  ITrendVideo,
} from '@genfeedai/interfaces';
import { Timeframe } from '@genfeedai/enums';

/**
 * Props for ViralVideoLeaderboard component
 */
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

/**
 * Props for TrendingHashtags component
 */
export interface TrendingHashtagsProps {
  hashtags: ITrendHashtag[];
  isLoading?: boolean;
  selectedPlatform?: string;
  onPlatformChange?: (platform: string) => void;
  onHashtagClick?: (hashtag: ITrendHashtag) => void;
  className?: string;
}

/**
 * Props for TrendingSounds component
 */
export interface TrendingSoundsProps {
  sounds: ITrendSound[];
  isLoading?: boolean;
  onSoundClick?: (sound: ITrendSound) => void;
  onPlaySound?: (sound: ITrendSound) => void;
  className?: string;
}

/**
 * Props for PlatformTrendsTabs component
 */
export interface PlatformTrendsTabsProps {
  selectedPlatform: string;
  onPlatformChange: (platform: string) => void;
  platforms?: string[];
  className?: string;
}
