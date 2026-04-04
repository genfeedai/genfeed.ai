import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
} from '@genfeedai/enums';
import type {
  IReplyBotConfig,
  IReplyBotDmConfig,
  IReplyBotFilters,
  IReplyBotRateLimits,
  IReplyBotSchedule,
} from '@genfeedai/interfaces';

export class ReplyBotConfig extends BaseEntity implements IReplyBotConfig {
  public declare organization: string;
  public declare brand?: string;
  public declare user?: string;
  public declare credential?: string;
  public declare name: string;
  public declare description?: string;
  public declare type: ReplyBotType;
  public declare platform: ReplyBotPlatform;
  public declare actionType: ReplyBotActionType;
  public declare isActive: boolean;
  public declare replyTone?: string;
  public declare replyLength?: string;
  public declare replyInstructions?: string;
  public declare templateId?: string;
  public declare dmConfig?: IReplyBotDmConfig;
  public declare rateLimits: IReplyBotRateLimits;
  public declare schedule?: IReplyBotSchedule;
  public declare filters?: IReplyBotFilters;
  public declare monitoredAccounts: string[];
  public declare totalRepliesSent: number;
  public declare totalDmsSent: number;
  public declare totalSkipped: number;
  public declare totalFailed: number;
  public declare lastActivityAt?: string;

  constructor(data: Partial<IReplyBotConfig> = {}) {
    super(data);
  }
}
