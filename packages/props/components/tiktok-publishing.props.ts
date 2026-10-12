import type { IPost } from '@genfeedai/contracts/interfaces';

export interface TikTokPublishingSettingsProps {
  post: IPost;
  onSaved?: () => Promise<void>;
  onReadinessChange?: (isReady: boolean) => void;
}
