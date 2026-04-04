import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  DashboardPreferences,
  ISetting,
  TrendNotificationFrequency,
} from '@genfeedai/interfaces';

export class Setting extends BaseEntity implements ISetting {
  public declare theme: string;
  public declare isVerified: boolean;
  public declare isFirstLogin: boolean;
  public declare isMenuCollapsed: boolean;
  public declare isAdvancedMode: boolean;
  public declare isTrendNotificationsInApp: boolean;
  public declare isTrendNotificationsTelegram: boolean;
  public declare isTrendNotificationsEmail: boolean;
  public declare isWorkflowNotificationsEmail: boolean;
  public declare isVideoNotificationsEmail: boolean;
  public declare trendNotificationsTelegramChatId?: string;
  public declare trendNotificationsEmailAddress?: string;
  public declare trendNotificationsFrequency: TrendNotificationFrequency;
  public declare trendNotificationsMinViralScore: number;
  public declare defaultAgentModel?: string;
  public declare isAgentAssetsPanelOpen?: boolean;
  public declare dashboardPreferences?: DashboardPreferences;

  constructor(data: Partial<ISetting> = {}) {
    super(data);
  }
}
