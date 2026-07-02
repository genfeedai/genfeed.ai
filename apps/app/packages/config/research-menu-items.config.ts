import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  HiArrowTrendingUp,
  HiMegaphone,
  HiOutlineArrowTrendingUp,
  HiOutlineMegaphone,
  HiOutlineSquares2X2,
  HiSquares2X2,
} from 'react-icons/hi2';

export const RESEARCH_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.RESEARCH.DISCOVERY,
    label: 'Discovery',
    matchPaths: [APP_ROUTES.RESEARCH.ROOT, APP_ROUTES.RESEARCH.DISCOVERY],
    outline: HiOutlineArrowTrendingUp,
    solid: HiArrowTrendingUp,
  },
  {
    group: '',
    href: APP_ROUTES.RESEARCH.SOCIALS,
    label: 'Socials',
    matchPaths: [APP_ROUTES.RESEARCH.SOCIALS],
    outline: HiOutlineSquares2X2,
    solid: HiSquares2X2,
  },
  {
    group: '',
    href: APP_ROUTES.RESEARCH.ADS,
    label: 'Ads',
    matchPaths: [
      APP_ROUTES.RESEARCH.ADS,
      APP_ROUTES.RESEARCH.ADS_GOOGLE,
      APP_ROUTES.RESEARCH.ADS_META,
    ],
    outline: HiOutlineMegaphone,
    solid: HiMegaphone,
  },
];

export const RESEARCH_LOGO_HREF = APP_ROUTES.RESEARCH.DISCOVERY;
