import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  HiChartBar,
  HiChatBubbleLeftRight,
  HiOutlineChartBar,
  HiOutlineChatBubbleLeftRight,
  HiOutlineSquares2X2,
  HiSquares2X2,
} from 'react-icons/hi2';

export const ORG_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.OVERVIEW.ROOT,
    label: 'Overview',
    matchPaths: [APP_ROUTES.OVERVIEW.ROOT],
    outline: HiOutlineSquares2X2,
    solid: HiSquares2X2,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.OVERVIEW,
    label: 'Analytics',
    matchPaths: [APP_ROUTES.ANALYTICS.ROOT, APP_ROUTES.ANALYTICS.OVERVIEW],
    outline: HiOutlineChartBar,
    solid: HiChartBar,
  },
  {
    group: '',
    href: APP_ROUTES.AGENT.ROOT,
    label: 'Agent',
    matchPaths: [APP_ROUTES.AGENT.ROOT],
    outline: HiOutlineChatBubbleLeftRight,
    solid: HiChatBubbleLeftRight,
  },
];

export const ORG_LOGO_HREF = APP_ROUTES.OVERVIEW.ROOT;
