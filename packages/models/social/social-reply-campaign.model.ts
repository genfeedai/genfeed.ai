import type {
  SocialPlatform,
  SocialReplyCampaign,
  SocialReplyCampaignStatus,
} from '@genfeedai/contracts/interfaces';

export class SocialReplyCampaignModel implements SocialReplyCampaign {
  id!: string;
  organizationId?: string;
  brandId?: string | null;
  userId?: string | null;
  name!: string;
  description?: string | null;
  platform!: SocialPlatform;
  messageType!: 'dm' | 'reply';
  status!: SocialReplyCampaignStatus;
  bodyTemplate!: string;
  maxPerHour!: number;
  maxPerDay!: number;
  minDelaySeconds!: number;
  totalRecipients!: number;
  sentCount!: number;
  failedCount!: number;
  skippedCount!: number;
  dispatchCursor!: number;
  startedAt?: string | null;
  pausedAt?: string | null;
  completedAt?: string | null;
  nextRunAt?: string | null;
  lastDispatchedAt?: string | null;
  lastError?: string | null;
  workflowId?: string | null;
  workflowExecutionId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt!: string;
  updatedAt!: string;

  constructor(partial: Partial<SocialReplyCampaign>) {
    Object.assign(this, partial);
  }

  /** Recipients that have reached a terminal state, sent or not. */
  get processedCount(): number {
    return (
      (this.sentCount ?? 0) + (this.failedCount ?? 0) + (this.skippedCount ?? 0)
    );
  }

  get remainingCount(): number {
    return Math.max((this.totalRecipients ?? 0) - this.processedCount, 0);
  }

  get progressPercent(): number {
    if (!this.totalRecipients) {
      return 0;
    }
    return Math.min(
      Math.round((this.processedCount / this.totalRecipients) * 100),
      100,
    );
  }
}
