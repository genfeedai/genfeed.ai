import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  HiArrowTrendingUp,
  HiBuildingOffice2,
  HiChartBar,
  HiDocumentText,
  HiFire,
  HiOutlineArrowTrendingUp,
  HiOutlineBuildingOffice2,
  HiOutlineChartBar,
  HiOutlineDocumentText,
  HiOutlineFire,
  HiOutlineSparkles,
  HiSparkles,
} from 'react-icons/hi2';

export const ANALYTICS_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.OVERVIEW,
    label: 'Overview',
    matchPaths: [APP_ROUTES.ANALYTICS.ROOT, APP_ROUTES.ANALYTICS.OVERVIEW],
    outline: HiOutlineChartBar,
    solid: HiChartBar,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.POSTS,
    label: 'Posts',
    matchPaths: [APP_ROUTES.ANALYTICS.POSTS],
    outline: HiOutlineDocumentText,
    solid: HiDocumentText,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.BRANDS,
    label: 'Brands',
    matchPaths: [APP_ROUTES.ANALYTICS.BRANDS],
    outline: HiOutlineBuildingOffice2,
    solid: HiBuildingOffice2,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.INSIGHTS,
    label: 'Insights',
    matchPaths: [APP_ROUTES.ANALYTICS.INSIGHTS],
    outline: HiOutlineSparkles,
    solid: HiSparkles,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.HOOKS,
    label: 'Hooks',
    matchPaths: [APP_ROUTES.ANALYTICS.HOOKS],
    outline: HiOutlineArrowTrendingUp,
    solid: HiArrowTrendingUp,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.PERFORMANCE_LAB,
    label: 'Performance Lab',
    matchPaths: [APP_ROUTES.ANALYTICS.PERFORMANCE_LAB],
    outline: HiOutlineChartBar,
    solid: HiChartBar,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.TREND_TURNOVER,
    label: 'Trend Turnover',
    matchPaths: [APP_ROUTES.ANALYTICS.TREND_TURNOVER],
    outline: HiOutlineArrowTrendingUp,
    solid: HiArrowTrendingUp,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.STREAKS,
    label: 'Streaks',
    matchPaths: [APP_ROUTES.ANALYTICS.STREAKS],
    outline: HiOutlineFire,
    solid: HiFire,
  },
];

export const ANALYTICS_LOGO_HREF = APP_ROUTES.ANALYTICS.OVERVIEW;
