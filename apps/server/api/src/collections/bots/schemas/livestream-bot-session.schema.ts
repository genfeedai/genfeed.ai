import type { BotLivestreamMessageType } from '@api/collections/bots/schemas/bot.schema';
import type { LivestreamBotSession } from '@genfeedai/prisma';

export type { LivestreamBotSession } from '@genfeedai/prisma';

export type LivestreamContextSource = 'manual_override' | 'transcript' | 'none';

export interface LivestreamManualOverride {
  activeLinkId?: string;
  expiresAt?: Date;
  promotionAngle?: string;
  topic?: string;
  [key: string]: unknown;
}

export interface LivestreamSessionContext {
  currentTopic?: string;
  manualOverride?: LivestreamManualOverride;
  promotionAngle?: string;
  source: LivestreamContextSource;
  transcriptConfidence?: number;
  transcriptSummary?: string;
  [key: string]: unknown;
}

export interface LivestreamDeliveryRecord {
  createdAt?: Date;
  id: string;
  message: string;
  platform: string;
  reason?: string;
  status: 'sent' | 'failed';
  targetId?: string;
  type: BotLivestreamMessageType;
  [key: string]: unknown;
}

export interface LivestreamPlatformState {
  hourlyPostCount: number;
  hourWindowStartedAt?: Date;
  lastError?: string;
  lastPostedAt?: Date;
  platform: string;
  [key: string]: unknown;
}

export interface LivestreamTranscriptChunk {
  confidence?: number;
  createdAt?: Date;
  text: string;
  [key: string]: unknown;
}

export interface LivestreamBotSessionData {
  context?: LivestreamSessionContext;
  deliveryHistory?: LivestreamDeliveryRecord[];
  lastTranscriptAt?: Date | null;
  pausedAt?: Date | null;
  platformStates?: LivestreamPlatformState[];
  startedAt?: Date | null;
  status?: string;
  stoppedAt?: Date | null;
  transcriptChunks?: LivestreamTranscriptChunk[];
  [key: string]: unknown;
}

export interface LivestreamBotSessionDocument
  extends Omit<LivestreamBotSession, 'data'>,
    LivestreamBotSessionData {
  botId: string | null;
  brandId: string | null;
  data?: LivestreamBotSessionData;
  organizationId: string | null;
  userId: string | null;
  [key: string]: unknown;
}
