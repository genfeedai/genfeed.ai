import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  HiClipboardDocumentList,
  HiClock,
  HiInboxStack,
  HiOutlineClipboardDocumentList,
  HiOutlineClock,
  HiOutlineInboxStack,
  HiOutlineSquares2X2,
  HiSquares2X2,
} from 'react-icons/hi2';

/** Label after which dynamic credential items are inserted */
export const POSTS_INSERT_AFTER_LABEL = 'Review';

export enum AppMenuGroup {
  Root = '',
}

export const APP_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: AppMenuGroup.Root,
    href: '/workspace/overview',
    label: 'Dashboard',
    matchPaths: ['/workspace', '/workspace/overview'],
    outline: HiOutlineSquares2X2,
    solid: HiSquares2X2,
  },
  {
    group: AppMenuGroup.Root,
    href: '/workspace/inbox/unread',
    label: 'Inbox',
    matchPaths: [
      '/workspace/inbox',
      '/workspace/inbox/unread',
      '/workspace/inbox/recent',
      '/workspace/inbox/all',
    ],
    outline: HiOutlineInboxStack,
    solid: HiInboxStack,
  },
  {
    group: AppMenuGroup.Root,
    href: '/tasks',
    label: 'Tasks',
    matchPaths: ['/tasks'],
    outline: HiOutlineClipboardDocumentList,
    solid: HiClipboardDocumentList,
  },
  {
    group: AppMenuGroup.Root,
    href: '/workspace/activity',
    label: 'Activity',
    matchPaths: ['/workspace/activity'],
    outline: HiOutlineClock,
    solid: HiClock,
  },
];

export function getAppSecondaryMenuItems(
  _brandSlug?: string | null,
): MenuItemConfig[] {
  return [];
}

export const APP_LOGO_HREF = '/workspace/overview';
