import { Platform } from './platform.enum';
import { Scope } from './scope.enum';

export enum BotCategory {
  CHAT = 'chat',
  COMMENT = 'comment',
  ENGAGEMENT = 'engagement',
  LIVESTREAM_CHAT = 'livestream_chat',
  MONITORING = 'monitoring',
  PUBLISHING = 'publishing',
}

export const BotScope = {
  BRAND: Scope.BRAND,
  ORGANIZATION: Scope.ORGANIZATION,
  USER: Scope.USER,
} as const;

export type BotScope = (typeof BotScope)[keyof typeof BotScope];

export const BotPlatform = {
  TWITCH: Platform.TWITCH,
  TWITTER: Platform.TWITTER,
  YOUTUBE: Platform.YOUTUBE,
} as const;

export type BotPlatform = (typeof BotPlatform)[keyof typeof BotPlatform];

export enum BotStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  INACTIVE = 'inactive',
}

export enum BotLivestreamMessageType {
  SCHEDULED_LINK_DROP = 'scheduled_link_drop',
  SCHEDULED_HOST_PROMPT = 'scheduled_host_prompt',
  CONTEXT_AWARE_QUESTION = 'context_aware_question',
}

export enum BotLivestreamTargetAudience {
  HOSTS = 'hosts',
  AUDIENCE = 'audience',
}

export enum BotLivestreamSessionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  STOPPED = 'stopped',
}

export enum EngagementAction {
  LIKE = 'like',
  FOLLOW = 'follow',
  RETWEET = 'retweet',
  BOOKMARK = 'bookmark',
}

export enum MonitoringAlertType {
  EMAIL = 'email',
  WEBHOOK = 'webhook',
  IN_APP = 'in_app',
  SLACK = 'slack',
}

export enum PublishingFrequency {
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  CUSTOM = 'custom',
}
