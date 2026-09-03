import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
} from '@genfeedai/contracts';
import type {
  IReplyBotConfig,
  IReplyBotDmConfig,
  IReplyBotFilters,
  IReplyBotRateLimits,
  IReplyBotSchedule,
} from '@genfeedai/contracts/interfaces';

export class ReplyBotConfig extends BaseEntity implements IReplyBotConfig {
  declare public organizationId: string;
  declare public brandId?: string;
  declare public userId: string;
  declare public credentialId?: string;
  declare public name: string;
  declare public description?: string;
  declare public type: ReplyBotType;
  declare public platform: ReplyBotPlatform;
  declare public actionType: ReplyBotActionType;
  declare public isActive: boolean;
  declare public replyTone?: string;
  declare public replyLength?: string;
  declare public replyInstructions?: string;
  declare public templateId?: string;
  declare public dmConfig?: IReplyBotDmConfig;
  declare public rateLimits: IReplyBotRateLimits;
  declare public schedule?: IReplyBotSchedule;
  declare public filters?: IReplyBotFilters;
  declare public monitoredAccountIds: string[];
  declare public totalRepliesSent: number;
  declare public totalDmsSent: number;
  declare public totalSkipped: number;
  declare public totalFailed: number;
  declare public lastActivityAt?: string;

  constructor(data: Partial<IReplyBotConfig> = {}) {
    super(data);
  }
}
