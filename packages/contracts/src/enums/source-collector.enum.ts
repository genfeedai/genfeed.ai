export enum SocialSourcePlatform {
  TWITTER = 'twitter',
  INSTAGRAM = 'instagram',
  TIKTOK = 'tiktok',
}

export enum SocialSourceType {
  ACCOUNT = 'account',
  /** Container for single posts imported by URL — no sync cadence. */
  POST = 'post',
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
