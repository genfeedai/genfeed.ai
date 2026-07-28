export enum SocialInboxPlatform {
  YOUTUBE = 'youtube',
  INSTAGRAM = 'instagram',
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
  AGENT = 'agent',
  SYSTEM = 'system',
  USER = 'user',
  WORKFLOW = 'workflow',
}
