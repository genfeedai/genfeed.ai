export enum FanvueSubscriberStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum FanvueContentStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum FanvueContentType {
  IMAGE = 'image',
  VIDEO = 'video',
  TEXT = 'text',
  BUNDLE = 'bundle',
}

export enum FanvueScheduleStatus {
  PENDING = 'pending',
  PUBLISHED = 'published',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum FanvueEarningsType {
  SUBSCRIPTION = 'subscription',
  TIP = 'tip',
  PPV = 'ppv',
  REFERRAL = 'referral',
}

export enum FanvueSyncAction {
  UPLOAD = 'upload',
  PUBLISH = 'publish',
  DELETE = 'delete',
  SYNC_SUBSCRIBERS = 'sync_subscribers',
  SYNC_EARNINGS = 'sync_earnings',
}

export enum FanvueSyncStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  PARTIAL = 'partial',
}
