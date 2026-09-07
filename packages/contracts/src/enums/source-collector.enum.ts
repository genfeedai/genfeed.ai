export enum SocialSourcePlatform {
  TWITTER = 'twitter',
  INSTAGRAM = 'instagram',
  TIKTOK = 'tiktok',
  /** Own-account history only (YouTube Data API); no public timeline collector. */
  YOUTUBE = 'youtube',
  /** Own-account history only (LinkedIn UGC posts); no public timeline collector. */
  LINKEDIN = 'linkedin',
}

export enum SocialSourceType {
  ACCOUNT = 'account',
  /** Container for single posts imported by URL — no sync cadence. */
  POST = 'post',
  /**
   * The brand's own connected account, auto-created when a credential is
   * connected. Its posts were published outside Genfeed and are imported to
   * seed the brand's performance dataset.
   */
  OWN_ACCOUNT = 'own-account',
}

export enum SocialSourceHistoryImportStatus {
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum ListeningSourcePlatform {
  TWITTER = 'twitter',
  REDDIT = 'reddit',
  HACKER_NEWS = 'hacker_news',
  INSTAGRAM = 'instagram',
  LINKEDIN = 'linkedin',
  YOUTUBE = 'youtube',
}

export enum ListeningEvidenceType {
  COMMENT = 'comment',
  MENTION = 'mention',
  POST = 'post',
  REPLY = 'reply',
  REVIEW = 'review',
}

export enum SourcePostActionType {
  DRAFT = 'draft',
  REPLY = 'reply',
  QUOTE = 'quote',
  /** Native X repost (retweet without commentary). Distinct from QUOTE. */
  REPOST = 'repost',
  REMIX = 'remix',
  SEND_TO_AGENT = 'send_to_agent',
}

export enum SourcePostContentType {
  TWEET = 'tweet',
  POST = 'post',
  REEL = 'reel',
  VIDEO = 'video',
}
