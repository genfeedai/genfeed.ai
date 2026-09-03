import { BaseEntity } from '@genfeedai/client/models';

export type LivestreamSessionStatus = 'active' | 'paused' | 'stopped';
export type LivestreamMessageType =
  | 'scheduled_link_drop'
  | 'scheduled_host_prompt'
  | 'context_aware_question';

export interface LivestreamManualOverride {
  topic?: string;
  promotionAngle?: string;
  activeLinkId?: string;
  expiresAt?: string;
}

export interface LivestreamContextState {
  currentTopic?: string;
  promotionAngle?: string;
  transcriptSummary?: string;
  transcriptConfidence?: number;
  source?: 'manual_override' | 'transcript' | 'none';
  manualOverride?: LivestreamManualOverride;
}

export interface LivestreamTranscriptChunk {
  text: string;
  confidence?: number;
  createdAt?: string;
}

export interface LivestreamPlatformState {
  platform: 'twitch' | 'youtube';
  lastPostedAt?: string;
  hourWindowStartedAt?: string;
  hourlyPostCount: number;
  lastError?: string;
}

export interface LivestreamDeliveryRecord {
  id: string;
  platform: 'twitch' | 'youtube';
  type: LivestreamMessageType;
  status: 'sent' | 'skipped' | 'failed';
  message: string;
  reason?: string;
  targetId?: string;
  createdAt?: string;
}

export interface ILivestreamSession {
  id: string;
  bot: string;
  organizationId?: string;
  brandId?: string;
  userId?: string;
  status: LivestreamSessionStatus;
  context: LivestreamContextState;
  transcriptChunks: LivestreamTranscriptChunk[];
  platformStates: LivestreamPlatformState[];
  deliveryHistory: LivestreamDeliveryRecord[];
  startedAt?: string;
  pausedAt?: string;
  stoppedAt?: string;
  lastTranscriptAt?: string;
}

export class LivestreamSession
  extends BaseEntity
  implements ILivestreamSession
{
  declare public bot: string;
  declare public organizationId?: string;
  declare public brandId?: string;
  declare public userId?: string;
  declare public status: LivestreamSessionStatus;
  declare public context: LivestreamContextState;
  declare public transcriptChunks: LivestreamTranscriptChunk[];
  declare public platformStates: LivestreamPlatformState[];
  declare public deliveryHistory: LivestreamDeliveryRecord[];
  declare public startedAt?: string;
  declare public pausedAt?: string;
  declare public stoppedAt?: string;
  declare public lastTranscriptAt?: string;

  constructor(data: Partial<ILivestreamSession> = {}) {
    super(data);
    this.bot = data.bot ?? '';
    this.organizationId = data.organizationId;
    this.brandId = data.brandId;
    this.userId = data.userId;
    this.status = data.status ?? 'stopped';
    this.context = {
      ...data.context,
    };
    this.transcriptChunks = [...(data.transcriptChunks ?? [])];
    this.platformStates = [...(data.platformStates ?? [])];
    this.deliveryHistory = [...(data.deliveryHistory ?? [])];
    this.startedAt = data.startedAt;
    this.pausedAt = data.pausedAt;
    this.stoppedAt = data.stoppedAt;
    this.lastTranscriptAt = data.lastTranscriptAt;
  }
}
