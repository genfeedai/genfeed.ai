import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  BotCategory,
  BotPlatform,
  BotScope,
  BotStatus,
} from '@genfeedai/contracts';
import type {
  IBot,
  IBotLivestreamSettings,
  IBotSettings,
  IBotTarget,
  IEngagementBotSettings,
  IMonitoringBotSettings,
  IPublishingBotSettings,
} from '@genfeedai/contracts/interfaces';

export class Bot extends BaseEntity implements IBot {
  declare public label: string;
  declare public description?: string;
  declare public category: BotCategory;
  declare public status: BotStatus;
  declare public scope: BotScope;
  declare public organizationId?: string;
  declare public brandId?: string;
  declare public userId?: string;
  declare public platforms: BotPlatform[];
  declare public targets: IBotTarget[];
  declare public settings: IBotSettings;
  declare public engagementSettings?: IEngagementBotSettings;
  declare public monitoringSettings?: IMonitoringBotSettings;
  declare public publishingSettings?: IPublishingBotSettings;
  declare public livestreamSettings?: IBotLivestreamSettings;
  declare public messagesCount: number;
  declare public engagementsCount: number;
  declare public alertsTriggered?: number;
  declare public postsPublished?: number;
  declare public lastActivityAt?: string;

  constructor(data: Partial<IBot> = {}) {
    super(data);
  }
}
