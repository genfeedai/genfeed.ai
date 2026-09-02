import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { BotActivityStatus, ReplyBotPlatform } from '@genfeedai/contracts';
import type { IBotActivity } from '@genfeedai/contracts/interfaces';

export class BotActivity extends BaseEntity implements IBotActivity {
  public declare organizationId: string;
  public declare brandId?: string;
  public declare userId: string;
  public declare replyBotConfigId?: string;
  public declare monitoredAccountId?: string;
  public declare platform: ReplyBotPlatform;
  public declare status: BotActivityStatus;
  public declare triggerContentId: string;
  public declare triggerContentText: string;
  public declare triggerContentAuthor: string;
  public declare triggerContentUrl?: string;
  public declare replyText?: string;
  public declare replyContentId?: string;
  public declare replyContentUrl?: string;
  public declare dmText?: string;
  public declare dmSent: boolean;
  public declare processingTimeMs?: number;
  public declare errorMessage?: string;
  public declare skippedReason?: string;

  constructor(data: Partial<IBotActivity> = {}) {
    super(data);
  }
}
