import { APP_ROUTES } from '@genfeedai/constants';
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
    href: APP_ROUTES.WORKSPACE.OVERVIEW,
    label: 'Dashboard',
    matchPaths: [APP_ROUTES.WORKSPACE.ROOT, APP_ROUTES.WORKSPACE.OVERVIEW],
    outline: HiOutlineSquares2X2,
    solid: HiSquares2X2,
  },
  {
    group: AppMenuGroup.Root,
    href: APP_ROUTES.WORKSPACE.INBOX_UNREAD,
    label: 'Inbox',
    matchPaths: [
      APP_ROUTES.WORKSPACE.INBOX,
      APP_ROUTES.WORKSPACE.INBOX_UNREAD,
      APP_ROUTES.WORKSPACE.INBOX_RECENT,
      APP_ROUTES.WORKSPACE.INBOX_ALL,
    ],
    outline: HiOutlineInboxStack,
    solid: HiInboxStack,
  },
  {
    group: AppMenuGroup.Root,
    href: APP_ROUTES.TASKS.ROOT,
    label: 'Tasks',
    matchPaths: [APP_ROUTES.TASKS.ROOT],
    outline: HiOutlineClipboardDocumentList,
    solid: HiClipboardDocumentList,
  },
  {
    group: AppMenuGroup.Root,
    href: APP_ROUTES.WORKSPACE.ACTIVITY,
    label: 'Activity',
    matchPaths: [APP_ROUTES.WORKSPACE.ACTIVITY],
    outline: HiOutlineClock,
    solid: HiClock,
  },
];

export function getAppSecondaryMenuItems(
  _brandSlug?: string | null,
): MenuItemConfig[] {
  return [];
}

export const APP_LOGO_HREF = APP_ROUTES.WORKSPACE.OVERVIEW;
