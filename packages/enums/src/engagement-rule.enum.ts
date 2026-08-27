/**
 * Engagement-triggered automation vocabularies (Postiz "Plugs" parity).
 * Prisma-backed; labels are SCREAMING. Foundation for #1170.
 */

export enum EngagementMetric {
  LIKES = 'LIKES',
  COMMENTS = 'COMMENTS',
  SHARES = 'SHARES',
  VIEWS = 'VIEWS',
  ENGAGEMENT_RATE = 'ENGAGEMENT_RATE',
}

export enum EngagementRuleAction {
  REPOST = 'REPOST',
  FOLLOW_UP_COMMENT = 'FOLLOW_UP_COMMENT',
}

export enum EngagementRuleMode {
  APPROVAL = 'APPROVAL',
  AUTO = 'AUTO',
}

export enum EngagementRuleState {
  ARMED = 'ARMED',
  TRIGGERED = 'TRIGGERED',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
  DISABLED = 'DISABLED',
}
