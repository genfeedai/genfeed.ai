import type { IPost } from '@genfeedai/contracts/interfaces';

export interface YouTubePublishingSettingsProps {
  post: IPost;
  onSaved?: () => Promise<void>;
  /** Rendered inside an inspector section that already supplies the title and chrome. */
  isEmbedded?: boolean;
}
