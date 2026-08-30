import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ThemePreference } from '@genfeedai/constants';
import type { TrendNotificationFrequency } from '@genfeedai/enums';
import type { DashboardPreferences, ISetting } from '@genfeedai/interfaces';

export class Setting extends BaseEntity implements ISetting {
  public declare theme: ThemePreference;
  public declare isVerified: boolean;
  public declare isFirstLogin: boolean;
  public declare isMenuCollapsed: boolean;
  public declare isAdvancedMode: boolean;
  public declare isTrendNotificationsInApp: boolean;
  public declare isTrendNotificationsTelegram: boolean;
  public declare isTrendNotificationsEmail: boolean;
  public declare isVideoNotificationsEmail: boolean;
  public declare trendNotificationsTelegramChatId?: string;
  public declare trendNotificationsEmailAddress?: string;
  public declare trendNotificationsFrequency: TrendNotificationFrequency;
  public declare trendNotificationsMinViralScore: number;
  public declare isAgentAssetsPanelOpen?: boolean;
  public declare dashboardPreferences?: DashboardPreferences;

  constructor(data: Partial<ISetting> = {}) {
    super(data);
  }
}
