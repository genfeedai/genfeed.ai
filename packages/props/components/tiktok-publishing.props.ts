import type { IPost } from '@genfeedai/contracts/interfaces';

export interface TikTokPublishingSettingsProps {
  post: IPost;
  onSaved?: () => Promise<void>;
  onReadinessChange?: (isReady: boolean) => void;
  /** Drop the bordered box and title so a host section can own the chrome. */
  isEmbedded?: boolean;
}
