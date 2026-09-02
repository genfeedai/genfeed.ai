import { BaseEntity } from '@api/entities/base.entity';
import { type Setting } from '@genfeedai/prisma';

export class SettingEntity extends BaseEntity implements Setting {
  declare readonly id: string;
  declare readonly userId: string;
  declare readonly theme: Setting['theme'];
  declare readonly locale: Setting['locale'];
  declare readonly isVerified: Setting['isVerified'];
  declare readonly isFirstLogin: Setting['isFirstLogin'];
  declare readonly isMenuCollapsed: Setting['isMenuCollapsed'];
  declare readonly isSidebarProgressVisible: Setting['isSidebarProgressVisible'];
  declare readonly isSidebarProgressCollapsed: Setting['isSidebarProgressCollapsed'];
  declare readonly isAdvancedMode: Setting['isAdvancedMode'];
  declare readonly isTrendNotificationsInApp: Setting['isTrendNotificationsInApp'];
  declare readonly isTrendNotificationsTelegram: Setting['isTrendNotificationsTelegram'];
  declare readonly isTrendNotificationsEmail: Setting['isTrendNotificationsEmail'];
  declare readonly isVideoNotificationsEmail: Setting['isVideoNotificationsEmail'];
  declare readonly trendNotificationsTelegramChatId: Setting['trendNotificationsTelegramChatId'];
  declare readonly trendNotificationsEmailAddress: Setting['trendNotificationsEmailAddress'];
  declare readonly trendNotificationsFrequency: Setting['trendNotificationsFrequency'];
  declare readonly trendNotificationsMinViralScore: Setting['trendNotificationsMinViralScore'];
  declare readonly contentPreferences: Setting['contentPreferences'];
  declare readonly favoriteModelKeys: Setting['favoriteModelKeys'];
  declare readonly isAgentAssetsPanelOpen: Setting['isAgentAssetsPanelOpen'];
  declare readonly generationPriority: Setting['generationPriority'];
  declare readonly dashboardPreferences: Setting['dashboardPreferences'];
}
