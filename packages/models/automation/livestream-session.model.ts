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
  organization?: string;
  brand?: string;
  user?: string;
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
  public declare bot: string;
  public declare organization?: string;
  public declare brand?: string;
  public declare user?: string;
  public declare status: LivestreamSessionStatus;
  public declare context: LivestreamContextState;
  public declare transcriptChunks: LivestreamTranscriptChunk[];
  public declare platformStates: LivestreamPlatformState[];
  public declare deliveryHistory: LivestreamDeliveryRecord[];
  public declare startedAt?: string;
  public declare pausedAt?: string;
  public declare stoppedAt?: string;
  public declare lastTranscriptAt?: string;

  constructor(data: Partial<ILivestreamSession> = {}) {
    super(data);
    this.bot = data.bot ?? '';
    this.organization = data.organization;
    this.brand = data.brand;
    this.user = data.user;
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
