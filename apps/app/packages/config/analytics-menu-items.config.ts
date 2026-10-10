import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import {
  AtSign,
  Building2,
  FileText,
  Flame,
  FlaskConical,
  LayoutDashboard,
  Magnet,
  ScanSearch,
  Sparkles,
  Zap,
} from 'lucide-react';

/**
 * Analytics is the single home for measuring the brand's own content — the
 * Publishing module no longer carries its own analytics page. Market trends
 * (Trends, Trend Turnover) are research, so they live in Discovery.
 *
 * Shell already labels the module Analytics. What-happened destinations sit
 * ungrouped under that header (Overview, Posts, Brands, Streaks) so the
 * sidebar does not stack ANALYTICS + PERFORMANCE. Intelligence stays a group
 * (Insights, Hooks, Outliers, Breakouts, Lab).
 *
 * Overview, Accounts and Outliers exist under both brand and organization
 * scope. Leave their hrefScope unset so navigation preserves the URL scope.
 * Items with `hrefScope: 'brand'` are brand-route only — hide them on org scope
 * or they 404.
 *
 * Every icon is unique — a repeated glyph makes two rows read as one entry.
 */
export const ANALYTICS_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.OVERVIEW,
    label: 'Overview',
    matchPaths: [APP_ROUTES.ANALYTICS.ROOT, APP_ROUTES.ANALYTICS.OVERVIEW],
    outline: LayoutDashboard,
    solid: LayoutDashboard,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.ACCOUNTS,
    label: 'Accounts',
    matchPaths: [APP_ROUTES.ANALYTICS.ACCOUNTS],
    outline: AtSign,
    solid: AtSign,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.POSTS,
    hrefScope: 'brand',
    label: 'Posts',
    matchPaths: [APP_ROUTES.ANALYTICS.POSTS],
    outline: FileText,
    solid: FileText,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.BRANDS,
    hrefScope: 'brand',
    label: 'Brands',
    matchPaths: [APP_ROUTES.ANALYTICS.BRANDS],
    outline: Building2,
    solid: Building2,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.STREAKS,
    hrefScope: 'brand',
    label: 'Streaks',
    matchPaths: [APP_ROUTES.ANALYTICS.STREAKS],
    outline: Flame,
    solid: Flame,
  },
  {
    group: 'Intelligence',
    href: APP_ROUTES.ANALYTICS.INSIGHTS,
    hrefScope: 'brand',
    label: 'Insights',
    matchPaths: [APP_ROUTES.ANALYTICS.INSIGHTS],
    outline: Sparkles,
    solid: Sparkles,
  },
  {
    group: 'Intelligence',
    href: APP_ROUTES.ANALYTICS.HOOKS,
    hrefScope: 'brand',
    label: 'Hooks',
    matchPaths: [APP_ROUTES.ANALYTICS.HOOKS],
    outline: Magnet,
    solid: Magnet,
  },
  {
    group: 'Intelligence',
    href: APP_ROUTES.ANALYTICS.OUTLIERS,
    label: 'Outliers',
    matchPaths: [APP_ROUTES.ANALYTICS.OUTLIERS],
    outline: ScanSearch,
    solid: ScanSearch,
  },
  {
    group: 'Intelligence',
    href: APP_ROUTES.ANALYTICS.BREAKOUTS,
    hrefScope: 'brand',
    label: 'Breakouts',
    matchPaths: [APP_ROUTES.ANALYTICS.BREAKOUTS],
    outline: Zap,
    solid: Zap,
  },
  {
    // Pattern mining (hook/CTA/structure formulas) sits with Hooks / Insights.
    group: 'Intelligence',
    href: APP_ROUTES.ANALYTICS.PERFORMANCE_LAB,
    hrefScope: 'brand',
    label: 'Performance Lab',
    matchPaths: [APP_ROUTES.ANALYTICS.PERFORMANCE_LAB],
    outline: FlaskConical,
    solid: FlaskConical,
  },
];

/** True when the operator is on org analytics (`/:org/~/analytics…`), not brand. */
export function isOrgAnalyticsRouteScope(
  brandSlug: string | null | undefined,
): boolean {
  const normalized = brandSlug?.trim() ?? '';
  return normalized === '' || normalized === '~';
}

/** Menu items that exist for the current org vs brand analytics scope. */
export function getAnalyticsMenuItemsForScope(
  brandSlug: string | null | undefined,
): MenuItemConfig[] {
  const isOrgScope = isOrgAnalyticsRouteScope(brandSlug);
  if (!isOrgScope) {
    return ANALYTICS_MENU_ITEMS;
  }
  return ANALYTICS_MENU_ITEMS.filter((item) => item.hrefScope !== 'brand');
}
