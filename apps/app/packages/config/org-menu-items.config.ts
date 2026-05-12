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
    href: '/overview',
    label: 'Overview',
    matchPaths: ['/overview'],
    outline: HiOutlineSquares2X2,
    solid: HiSquares2X2,
  },
  {
    group: '',
    href: '/analytics/overview',
    label: 'Analytics',
    matchPaths: ['/analytics', '/analytics/overview'],
    outline: HiOutlineChartBar,
    solid: HiChartBar,
  },
  {
    group: '',
    href: '/chat',
    label: 'Agent',
    matchPaths: ['/chat'],
    outline: HiOutlineChatBubbleLeftRight,
    solid: HiChatBubbleLeftRight,
  },
];

export const ORG_LOGO_HREF = '/overview';
