import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  BarChart3,
  Building2,
  FileText,
  Flame,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

export const ANALYTICS_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.OVERVIEW,
    label: 'Overview',
    matchPaths: [APP_ROUTES.ANALYTICS.ROOT, APP_ROUTES.ANALYTICS.OVERVIEW],
    outline: BarChart3,
    solid: BarChart3,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.POSTS,
    label: 'Posts',
    matchPaths: [APP_ROUTES.ANALYTICS.POSTS],
    outline: FileText,
    solid: FileText,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.BRANDS,
    label: 'Brands',
    matchPaths: [APP_ROUTES.ANALYTICS.BRANDS],
    outline: Building2,
    solid: Building2,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.INSIGHTS,
    label: 'Insights',
    matchPaths: [APP_ROUTES.ANALYTICS.INSIGHTS],
    outline: Sparkles,
    solid: Sparkles,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.HOOKS,
    label: 'Hooks',
    matchPaths: [APP_ROUTES.ANALYTICS.HOOKS],
    outline: TrendingUp,
    solid: TrendingUp,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.PERFORMANCE_LAB,
    label: 'Performance Lab',
    matchPaths: [APP_ROUTES.ANALYTICS.PERFORMANCE_LAB],
    outline: BarChart3,
    solid: BarChart3,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.TREND_TURNOVER,
    label: 'Trend Turnover',
    matchPaths: [APP_ROUTES.ANALYTICS.TREND_TURNOVER],
    outline: TrendingUp,
    solid: TrendingUp,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.STREAKS,
    label: 'Streaks',
    matchPaths: [APP_ROUTES.ANALYTICS.STREAKS],
    outline: Flame,
    solid: Flame,
  },
];

export const ANALYTICS_LOGO_HREF = APP_ROUTES.ANALYTICS.OVERVIEW;
