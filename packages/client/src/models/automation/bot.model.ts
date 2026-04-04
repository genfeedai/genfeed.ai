import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  BotCategory,
  BotPlatform,
  BotScope,
  BotStatus,
} from '@genfeedai/enums';
import type {
  IBot,
  IBotLivestreamSettings,
  IBotSettings,
  IBotTarget,
  IEngagementBotSettings,
  IMonitoringBotSettings,
  IPublishingBotSettings,
} from '@genfeedai/interfaces';

export class Bot extends BaseEntity implements IBot {
  public declare label: string;
  public declare description?: string;
  public declare category: BotCategory;
  public declare status: BotStatus;
  public declare scope: BotScope;
  public declare organization?: string;
  public declare brand?: string;
  public declare user?: string;
  public declare platforms: BotPlatform[];
  public declare targets: IBotTarget[];
  public declare settings: IBotSettings;
  public declare engagementSettings?: IEngagementBotSettings;
  public declare monitoringSettings?: IMonitoringBotSettings;
  public declare publishingSettings?: IPublishingBotSettings;
  public declare livestreamSettings?: IBotLivestreamSettings;
  public declare messagesCount: number;
  public declare engagementsCount: number;
  public declare alertsTriggered?: number;
  public declare postsPublished?: number;
  public declare lastActivityAt?: string;

  constructor(data: Partial<IBot> = {}) {
    super(data);
  }
}
