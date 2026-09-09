import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { PageHelpRoute } from '@props/layout/page-help-route.props';

/**
 * Route prefix → `pages.help.<key>` catalog entry. Longest prefix wins, so
 * nested pages (e.g. workflows/new) inherit their section help unless listed.
 */
export const PAGE_HELP_ROUTES: PageHelpRoute[] = [
  { key: 'workspaceOverview', prefix: APP_ROUTES.WORKSPACE.OVERVIEW },
  { key: 'workspaceInbox', prefix: APP_ROUTES.WORKSPACE.INBOX },
  { key: 'workspaceTasks', prefix: APP_ROUTES.WORKSPACE.TASKS },
  { key: 'workspaceActivity', prefix: APP_ROUTES.WORKSPACE.ACTIVITY },
  { key: 'automationOverview', prefix: APP_ROUTES.AUTOMATION.OVERVIEW },
  { key: 'automationWorkflows', prefix: APP_ROUTES.AUTOMATION.WORKFLOWS },
  { key: 'automationTemplates', prefix: APP_ROUTES.AUTOMATION.TEMPLATES },
  { key: 'automationRuns', prefix: APP_ROUTES.AUTOMATION.RUNS },
  { key: 'automationAgents', prefix: APP_ROUTES.AUTOMATION.AGENTS },
  { key: 'automationPrograms', prefix: APP_ROUTES.AUTOMATION.CAMPAIGNS },
  { key: 'automationContentRuns', prefix: APP_ROUTES.AUTOMATION.CONTENT_RUNS },
  { key: 'publishingOverview', prefix: APP_ROUTES.PUBLISHING.OVERVIEW },
  { key: 'publishingPosts', prefix: APP_ROUTES.PUBLISHING.POSTS },
  { key: 'publishingApprovalQueue', prefix: APP_ROUTES.PUBLISHING.REVIEW },
  { key: 'publishingCalendar', prefix: APP_ROUTES.PUBLISHING.CALENDAR },
  { key: 'publishingCampaigns', prefix: APP_ROUTES.PUBLISHING.CAMPAIGNS },
  { key: 'publishingRemix', prefix: APP_ROUTES.PUBLISHING.REMIX },
  { key: 'analyticsOverview', prefix: APP_ROUTES.ANALYTICS.OVERVIEW },
  { key: 'analyticsAccounts', prefix: APP_ROUTES.ANALYTICS.ACCOUNTS },
  { key: 'analyticsPosts', prefix: APP_ROUTES.ANALYTICS.POSTS },
  { key: 'analyticsBrands', prefix: APP_ROUTES.ANALYTICS.BRANDS },
  { key: 'analyticsStreaks', prefix: APP_ROUTES.ANALYTICS.STREAKS },
  { key: 'analyticsInsights', prefix: APP_ROUTES.ANALYTICS.INSIGHTS },
  { key: 'analyticsHooks', prefix: APP_ROUTES.ANALYTICS.HOOKS },
  {
    key: 'analyticsPerformanceLab',
    prefix: APP_ROUTES.ANALYTICS.PERFORMANCE_LAB,
  },
  { key: 'analyticsTrends', prefix: APP_ROUTES.ANALYTICS.TRENDS },
  {
    key: 'analyticsTrendTurnover',
    prefix: APP_ROUTES.ANALYTICS.TREND_TURNOVER,
  },
  { key: 'library', prefix: APP_ROUTES.LIBRARY.ROOT },
  { key: 'libraryTrash', prefix: APP_ROUTES.LIBRARY.TRASH },
  { key: 'studioGenerate', prefix: APP_ROUTES.STUDIO.GENERATE },
  { key: 'studioStoryboard', prefix: APP_ROUTES.STUDIO.STORYBOARD },
  { key: 'studioClips', prefix: APP_ROUTES.STUDIO.CLIPS },
  { key: 'studioBatch', prefix: APP_ROUTES.STUDIO.BATCH },
  { key: 'studioFastlane', prefix: APP_ROUTES.STUDIO.FASTLANE },
  { key: 'studioEdit', prefix: APP_ROUTES.STUDIO.EDIT },
  { key: 'messagesInbox', prefix: APP_ROUTES.MESSAGES.ROOT },
  { key: 'messagesOutreach', prefix: APP_ROUTES.MESSAGES.OUTREACH },
  { key: 'messagesReplies', prefix: APP_ROUTES.MESSAGES.REPLIES },
  { key: 'messagesReplyDrip', prefix: APP_ROUTES.MESSAGES.REPLY_DRIP },
  { key: 'discoveryOverview', prefix: APP_ROUTES.DISCOVERY.OVERVIEW },
  { key: 'discoveryAds', prefix: APP_ROUTES.DISCOVERY.ADS },
];

/** Drop the `/orgSlug/brandSlug` (or `/orgSlug/~`) prefix from an app path. */
export function stripScopePrefix(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return `/${parts.slice(2).join('/')}`;
  }
  return pathname;
}

export function resolvePageHelpKey(pathname: string): string | null {
  const path = stripScopePrefix(pathname);
  let match: PageHelpRoute | null = null;
  for (const route of PAGE_HELP_ROUTES) {
    const isMatch =
      path === route.prefix || path.startsWith(`${route.prefix}/`);
    if (isMatch && (!match || route.prefix.length > match.prefix.length)) {
      match = route;
    }
  }
  return match?.key ?? null;
}
