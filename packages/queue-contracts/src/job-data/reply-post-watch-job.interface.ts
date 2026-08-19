import type { Platform } from '@genfeedai/enums';

/**
 * Delayed poll for new replies under a single owned post (24h window).
 * Each attempt is a short job; the series is scheduled at publish time.
 */
export interface ReplyPostWatchJobData {
  attempt: number;
  brandId: string;
  maxAttempts: number;
  organizationId: string;
  /**
   * Destination platform for comment fetch + inbound auto-send.
   * Defaults to twitter/X when omitted (publish hooks + historical jobs).
   */
  platform?: Platform.TWITTER | Platform.YOUTUBE;
  postId: string;
  /** Optional preview for draft context */
  postPreview?: string;
}

export interface ReplyPostWatchResult {
  attempt: number;
  commentsFound: number;
  enqueued: number;
  organizationId: string;
  postId: string;
}
