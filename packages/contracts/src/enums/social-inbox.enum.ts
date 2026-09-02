export enum SocialInboxPlatform {
  YOUTUBE = 'youtube',
  INSTAGRAM = 'instagram',
  TIKTOK = 'tiktok',
  TWITTER = 'twitter',
  LINKEDIN = 'linkedin',
  UNIPILE = 'unipile',
}

export enum SocialConversationStatus {
  OPEN = 'open',
  NEEDS_REVIEW = 'needs_review',
  RESOLVED = 'resolved',
  ARCHIVED = 'archived',
}

export enum SocialAutomationState {
  MANUAL = 'manual',
  DRAFTED = 'drafted',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  AUTOMATED = 'automated',
  FAILED = 'failed',
}

export enum SocialConversationType {
  COMMENT = 'comment',
  DM = 'dm',
  MENTION = 'mention',
  REPLY = 'reply',
}

export enum SocialMessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
  SYSTEM = 'system',
}

export enum SocialMessageType {
  COMMENT = 'comment',
  DM = 'dm',
  DRAFT = 'draft',
  NOTE = 'note',
  REPLY = 'reply',
}

export enum SocialActionActorType {
  SYSTEM = 'system',
  USER = 'user',
  WORKFLOW = 'workflow',
}

/**
 * Lifecycle of a throttled reply campaign. `RUNNING` is the only state that
 * lets a dispatch tick claim a recipient — pause/cancel work by flipping this
 * column, so an already-delayed BullMQ job simply no-ops when it lands.
 */
export enum SocialReplyCampaignStatus {
  DRAFT = 'draft',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export enum SocialReplyCampaignRecipientStatus {
  PENDING = 'pending',
  DISPATCHING = 'dispatching',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  CANCELLED = 'cancelled',
}
