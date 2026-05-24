import type { Bot } from '@genfeedai/prisma';

export type { Bot } from '@genfeedai/prisma';

export type BotLivestreamMessageType =
  | 'scheduled_link_drop'
  | 'scheduled_host_prompt'
  | 'context_aware_question';

export type BotLivestreamTargetAudience = 'hosts' | 'audience';

export interface BotTarget {
  channelId: string;
  channelLabel?: string;
  channelUrl?: string;
  credentialId?: string;
  isEnabled?: boolean;
  liveChatId?: string;
  platform: string;
  senderId?: string;
}

export interface BotResponseTemplate {
  response: string;
  trigger: string;
  [key: string]: unknown;
}

export interface BotSettings {
  messagesPerMinute?: number;
  responseDelaySeconds?: number;
  responses?: BotResponseTemplate[];
  triggers?: string[];
  [key: string]: unknown;
}

export interface BotLivestreamLink {
  id: string;
  label: string;
  url: string;
  [key: string]: unknown;
}

export interface BotLivestreamMessageTemplate {
  enabled?: boolean;
  id: string;
  platforms?: string[];
  text: string;
  type: BotLivestreamMessageType;
  [key: string]: unknown;
}

export interface BotLivestreamSettings {
  automaticPosting?: boolean;
  links?: BotLivestreamLink[];
  manualOverrideTtlMinutes?: number;
  maxAutoPostsPerHour?: number;
  messageTemplates?: BotLivestreamMessageTemplate[];
  minimumMessageGapSeconds?: number;
  prioritizeYoutube?: boolean;
  scheduledCadenceMinutes?: number;
  targetAudience?: BotLivestreamTargetAudience[];
  transcriptEnabled?: boolean;
  transcriptLookbackMinutes?: number;
  [key: string]: unknown;
}

export interface BotDocument
  extends Omit<Bot, 'config' | 'settings' | 'targets'> {
  _id: string;
  brand?: string | null;
  category?: string;
  config?: Record<string, unknown>;
  description?: string;
  livestreamSettings?: BotLivestreamSettings;
  organization: string;
  platforms?: string[];
  settings?: BotSettings | Record<string, unknown>;
  targets: BotTarget[];
  user: string;
  [key: string]: unknown;
}
