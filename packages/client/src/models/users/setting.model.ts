import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { TrendNotificationFrequency } from '@genfeedai/contracts';
import type { ThemePreference } from '@genfeedai/contracts/constants';
import type {
  DashboardPreferences,
  ISetting,
} from '@genfeedai/contracts/interfaces';

export class Setting extends BaseEntity implements ISetting {
  declare public theme: ThemePreference;
  declare public isVerified: boolean;
  declare public isFirstLogin: boolean;
  declare public isMenuCollapsed: boolean;
  declare public isAdvancedMode: boolean;
  declare public isTrendNotificationsInApp: boolean;
  declare public isTrendNotificationsTelegram: boolean;
  declare public isTrendNotificationsEmail: boolean;
  declare public isVideoNotificationsEmail: boolean;
  declare public trendNotificationsTelegramChatId?: string;
  declare public trendNotificationsEmailAddress?: string;
  declare public trendNotificationsFrequency: TrendNotificationFrequency;
  declare public trendNotificationsMinViralScore: number;
  declare public isAgentAssetsPanelOpen?: boolean;
  declare public dashboardPreferences?: DashboardPreferences;

  constructor(data: Partial<ISetting> = {}) {
    super(data);
  }
}
