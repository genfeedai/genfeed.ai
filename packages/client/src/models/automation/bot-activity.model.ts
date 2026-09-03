import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { BotActivityStatus, ReplyBotPlatform } from '@genfeedai/contracts';
import type { IBotActivity } from '@genfeedai/contracts/interfaces';

export class BotActivity extends BaseEntity implements IBotActivity {
  declare public organizationId: string;
  declare public brandId?: string;
  declare public userId: string;
  declare public replyBotConfigId?: string;
  declare public monitoredAccountId?: string;
  declare public platform: ReplyBotPlatform;
  declare public status: BotActivityStatus;
  declare public triggerContentId: string;
  declare public triggerContentText: string;
  declare public triggerContentAuthor: string;
  declare public triggerContentUrl?: string;
  declare public replyText?: string;
  declare public replyContentId?: string;
  declare public replyContentUrl?: string;
  declare public dmText?: string;
  declare public dmSent: boolean;
  declare public processingTimeMs?: number;
  declare public errorMessage?: string;
  declare public skippedReason?: string;

  constructor(data: Partial<IBotActivity> = {}) {
    super(data);
  }
}
