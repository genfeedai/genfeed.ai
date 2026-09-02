import type { ChannelRepurposeAdjustment } from '@genfeedai/contracts/api-types/contracts/channel-repurpose.contract';
import type { Post } from '@genfeedai/prisma';

export type { Post } from '@genfeedai/prisma';

export interface PostDocument extends Omit<Post, 'credentialId' | 'platform'> {
  content?: string;
  credentialId: string | null;
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
  platform: string | null;
  /**
   * Response-only: the deterministic adaptations applied when a post is
   * repurposed to another channel. Computed per request, never persisted.
   */
  repurposeAdjustments?: ChannelRepurposeAdjustment[];
  [key: string]: unknown;
}
