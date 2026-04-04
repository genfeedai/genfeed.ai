export enum ReplyBotType {
  REPLY_GUY = 'reply_guy',
  ACCOUNT_MONITOR = 'account_monitor',
  COMMENT_RESPONDER = 'comment_responder',
}

export enum ReplyBotPlatform {
  TWITTER = 'twitter',
  INSTAGRAM = 'instagram',
  TIKTOK = 'tiktok',
  YOUTUBE = 'youtube',
  REDDIT = 'reddit',
}

export enum SocialContentType {
  TWEET = 'tweet',
  POST = 'post',
  REEL = 'reel',
  VIDEO = 'video',
  REDDIT_POST = 'reddit_post',
  COMMENT = 'comment',
}

export enum ReplyBotActionType {
  REPLY_ONLY = 'reply_only',
  DM_ONLY = 'dm_only',
  REPLY_AND_DM = 'reply_and_dm',
}

export enum BotActivityStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum BotActivitySkipReason {
  RATE_LIMITED = 'rate_limited',
  FILTERED_OUT = 'filtered_out',
  ALREADY_PROCESSED = 'already_processed',
  BOT_PAUSED = 'bot_paused',
  OUTSIDE_SCHEDULE = 'outside_schedule',
}
