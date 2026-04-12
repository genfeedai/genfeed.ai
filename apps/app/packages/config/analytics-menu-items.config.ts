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
    href: '/analytics/overview',
    label: 'Overview',
    matchPaths: ['/analytics', '/analytics/overview'],
    outline: HiOutlineChartBar,
    solid: HiChartBar,
  },
  {
    group: '',
    href: '/analytics/posts',
    label: 'Posts',
    matchPaths: ['/analytics/posts'],
    outline: HiOutlineDocumentText,
    solid: HiDocumentText,
  },
  {
    group: '',
    href: '/analytics/brands',
    label: 'Brands',
    matchPaths: ['/analytics/brands'],
    outline: HiOutlineBuildingOffice2,
    solid: HiBuildingOffice2,
  },
  {
    group: '',
    href: '/analytics/insights',
    label: 'Insights',
    matchPaths: ['/analytics/insights'],
    outline: HiOutlineSparkles,
    solid: HiSparkles,
  },
  {
    group: '',
    href: '/analytics/hooks',
    label: 'Hooks',
    matchPaths: ['/analytics/hooks'],
    outline: HiOutlineArrowTrendingUp,
    solid: HiArrowTrendingUp,
  },
  {
    group: '',
    href: '/analytics/performance-lab',
    label: 'Performance Lab',
    matchPaths: ['/analytics/performance-lab'],
    outline: HiOutlineChartBar,
    solid: HiChartBar,
  },
  {
    group: '',
    href: '/analytics/trend-turnover',
    label: 'Trend Turnover',
    matchPaths: ['/analytics/trend-turnover'],
    outline: HiOutlineArrowTrendingUp,
    solid: HiArrowTrendingUp,
  },
  {
    group: '',
    href: '/analytics/streaks',
    label: 'Streaks',
    matchPaths: ['/analytics/streaks'],
    outline: HiOutlineFire,
    solid: HiFire,
  },
];

export const ANALYTICS_LOGO_HREF = '/analytics/overview';
