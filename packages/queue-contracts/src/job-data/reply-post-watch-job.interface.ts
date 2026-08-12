/**
 * Delayed poll for new replies under a single owned post (24h window).
 * Each attempt is a short job; the series is scheduled at publish time.
 */
export interface ReplyPostWatchJobData {
  attempt: number;
  brandId: string;
  maxAttempts: number;
  organizationId: string;
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
