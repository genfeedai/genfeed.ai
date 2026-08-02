import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
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
 * Analytics is the single home for measurement — the Publish module no longer
 * carries its own analytics page.
 *
 * Menu grouping rules (headers separate the three questions the module answers):
 * - Performance: what happened (Overview, Posts, Brands)
 * - Intelligence: why it happened and what is next (Insights, Hooks,
 *   Performance Lab, Trends, Trend Turnover)
 * - Habits: how consistently you show up (Streaks)
 *
 * Every icon is unique — a repeated glyph makes two rows read as one entry.
 */
export const ANALYTICS_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: 'Performance',
    href: APP_ROUTES.ANALYTICS.OVERVIEW,
    label: 'Overview',
    matchPaths: [APP_ROUTES.ANALYTICS.OVERVIEW],
    outline: ChartColumn,
    solid: ChartColumn,
  },
  {
    group: 'Performance',
    href: APP_ROUTES.ANALYTICS.POSTS,
    label: 'Posts',
    matchPaths: [APP_ROUTES.ANALYTICS.POSTS],
    outline: FileText,
    solid: FileText,
  },
  {
    group: 'Performance',
    href: APP_ROUTES.ANALYTICS.BRANDS,
    label: 'Brands',
    matchPaths: [APP_ROUTES.ANALYTICS.BRANDS],
    outline: Building2,
    solid: Building2,
  },
  {
    group: 'Intelligence',
    href: APP_ROUTES.ANALYTICS.INSIGHTS,
    label: 'Insights',
    matchPaths: [APP_ROUTES.ANALYTICS.INSIGHTS],
    outline: Sparkles,
    solid: Sparkles,
  },
  {
    group: 'Intelligence',
    href: APP_ROUTES.ANALYTICS.HOOKS,
    label: 'Hooks',
    matchPaths: [APP_ROUTES.ANALYTICS.HOOKS],
    outline: Magnet,
    solid: Magnet,
  },
  {
    // Pattern mining (hook/CTA/structure formulas), so it sits with Hooks
    // rather than under Performance despite the label.
    group: 'Intelligence',
    href: APP_ROUTES.ANALYTICS.PERFORMANCE_LAB,
    label: 'Performance Lab',
    matchPaths: [APP_ROUTES.ANALYTICS.PERFORMANCE_LAB],
    outline: FlaskConical,
    solid: FlaskConical,
  },
  {
    // `/analytics/trends` shipped a page, drilldowns, and workspace-shell
    // breadcrumbs but never a nav entry — same orphan pattern as `/studio/clips`.
    group: 'Intelligence',
    href: APP_ROUTES.ANALYTICS.TRENDS,
    label: 'Trends',
    matchPaths: [APP_ROUTES.ANALYTICS.TRENDS],
    outline: TrendingUp,
    solid: TrendingUp,
  },
  {
    group: 'Intelligence',
    href: APP_ROUTES.ANALYTICS.TREND_TURNOVER,
    label: 'Trend Turnover',
    matchPaths: [APP_ROUTES.ANALYTICS.TREND_TURNOVER],
    outline: Repeat,
    solid: Repeat,
  },
  {
    group: 'Habits',
    href: APP_ROUTES.ANALYTICS.STREAKS,
    label: 'Streaks',
    matchPaths: [APP_ROUTES.ANALYTICS.STREAKS],
    outline: Flame,
    solid: Flame,
  },
];

export const ANALYTICS_LOGO_HREF = APP_ROUTES.ANALYTICS.OVERVIEW;
