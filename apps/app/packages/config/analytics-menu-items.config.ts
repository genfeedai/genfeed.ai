import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import {
  Building2,
  ChartColumn,
  FileText,
  Flame,
  FlaskConical,
  Magnet,
  Repeat,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

/**
 * Analytics is the single home for measurement — the Publishing module no longer
 * carries its own analytics page.
 *
 * Shell already labels the module Analytics. What-happened destinations sit
 * ungrouped under that header (Overview, Posts, Brands, Streaks) so the
 * sidebar does not stack ANALYTICS + PERFORMANCE. Intelligence stays a group
 * (Insights, Hooks, Lab, Trends).
 *
 * Org-level routes (`/:org/~/analytics/*`) only ship Overview today. Items with
 * `hrefScope: 'brand'` are brand-route only — hide them on org scope or they 404.
 *
 * Every icon is unique — a repeated glyph makes two rows read as one entry.
 */
export const ANALYTICS_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    // Only destination that exists under both brand and org (`~/`) analytics.
    href: APP_ROUTES.ANALYTICS.OVERVIEW,
    hrefScope: 'organization',
    label: 'Overview',
    matchPaths: [APP_ROUTES.ANALYTICS.ROOT, APP_ROUTES.ANALYTICS.OVERVIEW],
    outline: ChartColumn,
    solid: ChartColumn,
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
    // Pattern mining (hook/CTA/structure formulas) sits with Hooks / Insights.
    group: 'Intelligence',
    href: APP_ROUTES.ANALYTICS.PERFORMANCE_LAB,
    hrefScope: 'brand',
    label: 'Performance Lab',
    matchPaths: [APP_ROUTES.ANALYTICS.PERFORMANCE_LAB],
    outline: FlaskConical,
    solid: FlaskConical,
  },
  {
    group: 'Intelligence',
    href: APP_ROUTES.ANALYTICS.TRENDS,
    hrefScope: 'brand',
    label: 'Trends',
    matchPaths: [APP_ROUTES.ANALYTICS.TRENDS],
    outline: TrendingUp,
    solid: TrendingUp,
  },
  {
    group: 'Intelligence',
    href: APP_ROUTES.ANALYTICS.TREND_TURNOVER,
    hrefScope: 'brand',
    label: 'Trend Turnover',
    matchPaths: [APP_ROUTES.ANALYTICS.TREND_TURNOVER],
    outline: Repeat,
    solid: Repeat,
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
  // Org scope only has Overview. Keep it ungrouped under Analytics.
  return ANALYTICS_MENU_ITEMS.filter((item) => item.hrefScope !== 'brand');
}
