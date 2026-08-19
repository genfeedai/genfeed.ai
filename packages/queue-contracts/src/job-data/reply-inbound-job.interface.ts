import type { Platform } from '@genfeedai/enums';

/**
 * One inbound comment/reply to process (from XAA webhook or post-watch poll).
 */
export type ReplyInboundSource = 'xaa' | 'post-watch' | 'manual' | 'poll';

export interface ReplyInboundJobData {
  brandId?: string;
  commentAuthorId?: string;
  commentAuthorUsername: string;
  commentId: string;
  commentText: string;
  credentialId?: string;
  organizationId: string;
  parentPostId: string;
  parentPostPreview?: string;
  /**
   * Destination platform for auto-send (defaults to twitter/X for XAA + post-watch).
   * YouTube author replies currently enter via the Replies UI, not this queue.
   */
  platform?: Platform.TWITTER | Platform.YOUTUBE;
  /** ISO timestamp when the event was received */
  receivedAt: string;
  source: ReplyInboundSource;
}

export interface ReplyInboundResult {
  commentId: string;
  organizationId: string;
  skipped: boolean;
  success: boolean;
  error?: string;
}
