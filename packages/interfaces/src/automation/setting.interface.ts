import type { IBaseEntity } from '../index';
import type { DashboardPreferences } from '../settings/dashboard-settings.interface';

export type TrendNotificationFrequency =
  | 'realtime'
  | 'hourly'
  | 'daily'
  | 'weekly';

export interface ISetting extends IBaseEntity {
  theme: string;
  isVerified: boolean;
  isFirstLogin: boolean;
  isMenuCollapsed: boolean;
  isAdvancedMode: boolean;

  // Trend notification preferences
  isTrendNotificationsInApp: boolean;
  isTrendNotificationsTelegram: boolean;
  isTrendNotificationsEmail: boolean;
  trendNotificationsTelegramChatId?: string;
  trendNotificationsEmailAddress?: string;
  trendNotificationsFrequency: TrendNotificationFrequency;
  trendNotificationsMinViralScore: number;

  contentPreferences?: string[];
  defaultAgentModel?: string;
  isAgentAssetsPanelOpen?: boolean;
  generationPriority?: 'quality' | 'speed' | 'cost' | 'balanced';
  dashboardPreferences?: DashboardPreferences;
  isSidebarProgressCollapsed?: boolean;
  isSidebarProgressVisible?: boolean;
}
