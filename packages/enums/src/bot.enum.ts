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

/**
 * Bot lifecycle. Values match Prisma `BotStatus` (SCREAMING_SNAKE).
 * @see packages/prisma/prisma/schema.prisma `enum BotStatus`
 */
export enum BotStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  STOPPED = 'STOPPED',
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

/**
 * Where host/audience context for livestream bots comes from.
 * Restream-first product path: chat is official WS; host speech is external STT
 * (or manual) pushed into Genfeed — not OBS-specific.
 */
export enum LivestreamTranscriptSource {
  /** Producer or automation POSTs text/audioUrl chunks. */
  MANUAL = 'manual',
  /** Speech-to-text from an audio URL (Replicate/Whisper path). */
  AUDIO_URL = 'audio_url',
  /**
   * Unified multi-destination chat via Restream Chat WebSocket.
   * Audience context only — not host microphone.
   */
  RESTREAM_CHAT = 'restream_chat',
  /**
   * External caption/STT provider (SyncWords, Deepgram, etc.) webhooks into
   * Genfeed while the encoder feeds Restream — preferred host-speech path
   * without OBS.
   */
  EXTERNAL_CAPTION_WEBHOOK = 'external_caption_webhook',
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
