import type { IPost } from '@cloud/interfaces';

export interface PlatformTabBarProps {
  posts: IPost[];
  activePlatform: string;
  onPlatformChange: (platform: string) => void;
  onAddPlatform?: () => void;
  className?: string;
}
