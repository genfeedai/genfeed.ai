import type {
  AgentThreadMode,
  GenerationPriority,
  TrendNotificationFrequency,
} from '../..';
import type { AppLocale, ThemePreference } from '../../constants';
import type { IBaseEntity } from '../index';
import type { DashboardPreferences } from '../settings/dashboard-settings.interface';

export interface ISetting extends IBaseEntity {
  theme: ThemePreference;
  /** Typed against the allowlist so invalid catalogs never reach rendering. */
  locale?: AppLocale;
  isVerified: boolean;
  isFirstLogin: boolean;
  isMenuCollapsed: boolean;

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
  /**
   * Favorite workflow ids (#5510), at most 50. Scoped to the active
   * organization and pruned of deleted workflows when read.
   */
  favoriteWorkflowIds?: string[];
  /**
   * App ids pinned out of the rail More menu, in pin order. Only
   * studio, automation, messages and discovery are accepted.
   */
  pinnedAppIds?: string[];
  isAgentAssetsPanelOpen?: boolean;
  generationPriority?: GenerationPriority;
  dashboardPreferences?: DashboardPreferences;
  isSidebarProgressCollapsed?: boolean;
  isSidebarProgressVisible?: boolean;
  /** Saved default agent mode (#4672) applied to new agent threads. */
  agentMode?: AgentThreadMode;
}
