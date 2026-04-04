import type { IPost } from '@genfeedai/interfaces';

export interface PlatformTabBarProps {
  posts: IPost[];
  activePlatform: string;
  onPlatformChange: (platform: string) => void;
  onAddPlatform?: () => void;
  className?: string;
}
