import type { ButtonVariant } from '@genfeedai/contracts';

export type AnalyticsDashboardState = 'empty' | 'warming_up' | 'active';

export interface AnalyticsOverviewHeroAction {
  href: string;
  label: string;
  variant: ButtonVariant;
}

/**
 * The warming-up strip over a dashboard with no tracked performance.
 * `hasConnectedAccounts` picks the copy: with no account connected the
 * next step is connecting one, not waiting for a sync.
 */
export interface AnalyticsOverviewHeroContent {
  badge: string;
  description: string;
  hasConnectedAccounts: boolean;
  primaryAction: AnalyticsOverviewHeroAction;
  secondaryAction: AnalyticsOverviewHeroAction;
}

export interface AnalyticsOverviewHeroProps {
  heroContent: AnalyticsOverviewHeroContent;
}
