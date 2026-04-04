export enum CampaignPlatform {
  TWITTER = 'twitter',
  REDDIT = 'reddit',
  INSTAGRAM = 'instagram',
}

export enum CampaignType {
  MANUAL = 'manual',
  DISCOVERY = 'discovery',
  SCHEDULED_BLAST = 'scheduled',
  DM_OUTREACH = 'dm_outreach',
}

export enum CampaignStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
}

export enum CampaignTargetStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  PROCESSING = 'processing',
  REPLIED = 'replied',
  SENT = 'sent',
  SKIPPED = 'skipped',
  FAILED = 'failed',
}

export enum CampaignDiscoverySource {
  KEYWORD_SEARCH = 'keyword_search',
  TRENDING = 'trending',
  HASHTAG = 'hashtag',
  SUBREDDIT = 'subreddit',
  MANUAL = 'manual',
}

export enum CampaignTargetType {
  TWEET = 'tweet',
  REDDIT_POST = 'reddit_post',
  REDDIT_COMMENT = 'reddit_comment',
  DM_RECIPIENT = 'dm_recipient',
}

export enum CampaignSkipReason {
  BLOCKED_AUTHOR = 'blocked_author',
  LOW_RELEVANCE = 'low_relevance',
  CONTENT_TOO_OLD = 'content_too_old',
  LOW_ENGAGEMENT = 'low_engagement',
  HIGH_ENGAGEMENT = 'high_engagement',
  ALREADY_REPLIED = 'already_replied',
  RATE_LIMITED = 'rate_limited',
  CAMPAIGN_PAUSED = 'campaign_paused',
  MANUAL_SKIP = 'manual_skip',
  DM_NOT_ALLOWED = 'dm_not_allowed',
  USER_NOT_FOUND = 'user_not_found',
}
