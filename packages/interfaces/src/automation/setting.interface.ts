import type { AppLocale } from '@genfeedai/constants';
import type {
  GenerationPriority,
  TrendNotificationFrequency,
} from '@genfeedai/enums';
import type { IBaseEntity } from '../index';
import type { DashboardPreferences } from '../settings/dashboard-settings.interface';

export interface ISetting extends IBaseEntity {
  theme: string;
  /**
   * Typed against the allowlist rather than `string` (unlike `theme`) so a
   * value that cannot be rendered never reaches a message catalog lookup.
   */
  locale?: AppLocale;
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
  generationPriority?: GenerationPriority;
  dashboardPreferences?: DashboardPreferences;
  isSidebarProgressCollapsed?: boolean;
  isSidebarProgressVisible?: boolean;
}
