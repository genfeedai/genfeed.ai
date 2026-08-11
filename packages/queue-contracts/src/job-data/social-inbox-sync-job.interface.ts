import type { Platform, SocialConversationType } from '@genfeedai/enums';

/** Platforms whose inbox can be swept by the shared sync job. */
export type SocialInboxSyncPlatform = Platform.INSTAGRAM | Platform.YOUTUBE;

/** Inbox surfaces a sweep can target. */
export type SocialInboxSyncConversationType =
  | SocialConversationType.COMMENT
  | SocialConversationType.DM;

export interface SocialInboxSyncJobData {
  organizationId: string;
  brandId?: string;
  userId?: string;
  /** Restrict the sweep to a single connected credential. */
  credentialId?: string;
  /** Max comments to pull per post (1-100). */
  limit?: number;
  /**
   * Which platform to sweep. Optional so jobs enqueued before the Instagram
   * surfaces shipped still process as the YouTube comment sweep they were.
   */
  platform?: SocialInboxSyncPlatform;
  /** Which surface to sweep. Defaults to comments for the same reason. */
  conversationType?: SocialInboxSyncConversationType;
}

export interface SocialInboxSyncResult {
  conversationsCreated: number;
  messagesCreated: number;
}
