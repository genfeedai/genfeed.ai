import type { AppLocale, ThemePreference } from '@genfeedai/constants';
import type {
  GenerationPriority,
  TrendNotificationFrequency,
} from '@genfeedai/enums';
import type { IBaseEntity } from '../index';
import type { DashboardPreferences } from '../settings/dashboard-settings.interface';

export interface ISetting extends IBaseEntity {
  theme: ThemePreference;
  /** Typed against the allowlist so invalid catalogs never reach rendering. */
  locale?: AppLocale;
  isVerified: boolean;
  isFirstLogin: boolean;
  isMenuCollapsed: boolean;
  isAdvancedMode: boolean;

  // Trend notification preferences
  isTrendNotificationsInApp: boolean;
  isTrendNotificationsTelegram: boolean;
  isTrendNotificationsEmail: boolean;
  isVideoNotificationsEmail: boolean;
  trendNotificationsTelegramChatId?: string;
  trendNotificationsEmailAddress?: string;
  trendNotificationsFrequency: TrendNotificationFrequency;
  trendNotificationsMinViralScore: number;

  contentPreferences?: string[];
  isAgentAssetsPanelOpen?: boolean;
  generationPriority?: GenerationPriority;
  dashboardPreferences?: DashboardPreferences;
  isSidebarProgressCollapsed?: boolean;
  isSidebarProgressVisible?: boolean;
}
