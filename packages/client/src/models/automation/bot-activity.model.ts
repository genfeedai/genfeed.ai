import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { BotActivityStatus, ReplyBotPlatform } from '@genfeedai/enums';
import type { IBotActivity } from '@genfeedai/interfaces';

export class BotActivity extends BaseEntity implements IBotActivity {
  public declare organization: string;
  public declare replyBotConfig: string;
  public declare monitoredAccount?: string;
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
