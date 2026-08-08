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

/**
 * Outreach target lifecycle.
 *
 * `campaign_targets.status` is a `String` column (rule 2 of
 * `enum_source_of_truth`), not a Prisma enum — the orphan Postgres type of the
 * same name was dropped in `20260807160000_drop_orphan_enums`. It carried
 * PENDING/CONTACTED/RESPONDED/CONVERTED/REJECTED and never matched the pipeline
 * the campaign workers actually run, which is this set. Every write goes through
 * these members, the SQL default is `'PENDING'`, and
 * `20260808120000_canonicalize_draft_target_status_casing` uppercased the
 * legacy rows `20260609150437_reconcile_prod_schema` had lowercased — the
 * column holds exactly one casing (#2543).
 *
 * @see packages/prisma/prisma/schema.prisma `model CampaignTarget`
 */
export enum CampaignTargetStatus {
  PENDING = 'PENDING',
  SCHEDULED = 'SCHEDULED',
  PROCESSING = 'PROCESSING',
  REPLIED = 'REPLIED',
  SENT = 'SENT',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
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
