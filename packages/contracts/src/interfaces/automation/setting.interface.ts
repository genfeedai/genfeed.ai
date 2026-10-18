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
  /**
   * Rail order over every rail app (core and secondary), left to right.
   * Empty means the default order; unlisted apps follow in default order.
   */
  railAppOrder?: string[];
  /**
   * Core apps the member took off the rail. They stay in the More menu until
   * pinned back; empty keeps every core app on the rail.
   */
  hiddenAppIds?: string[];
  /**
   * The app the member lands on after login. Null or unset falls back to the
   * organization default, then Workspace.
   */
  homeAppId?: string | null;
  isAgentAssetsPanelOpen?: boolean;
  generationPriority?: GenerationPriority;
  dashboardPreferences?: DashboardPreferences;
  isSidebarProgressCollapsed?: boolean;
  isSidebarProgressVisible?: boolean;
  /** Saved default agent mode (#4672) applied to new agent threads. */
  agentMode?: AgentThreadMode;
}
