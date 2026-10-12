import type { IPost } from '@genfeedai/contracts/interfaces';

export interface YouTubePublishingSettingsProps {
  post: IPost;
  onSaved?: () => Promise<void>;
}
