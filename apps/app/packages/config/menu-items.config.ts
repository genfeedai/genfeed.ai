import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { ClipboardList, Clock, Inbox, LayoutGrid } from 'lucide-react';

/** Label after which dynamic credential items are inserted */
export const PUBLISH_INSERT_AFTER_LABEL = 'Review';

export enum AppMenuGroup {
  Root = '',
}

export const APP_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: AppMenuGroup.Root,
    // Complete path. Bare `/workspace` permanently redirects to this in
    // next.config — no isExactMatch needed for sibling route matching.
    href: APP_ROUTES.WORKSPACE.OVERVIEW,
    label: 'Overview',
    matchPaths: [APP_ROUTES.WORKSPACE.OVERVIEW],
    outline: LayoutGrid,
    solid: LayoutGrid,
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
    outline: Inbox,
    solid: Inbox,
  },
  {
    group: AppMenuGroup.Root,
    href: APP_ROUTES.WORKSPACE.TASKS,
    label: 'Tasks',
    matchPaths: [APP_ROUTES.WORKSPACE.TASKS],
    outline: ClipboardList,
    solid: ClipboardList,
  },
  {
    group: AppMenuGroup.Root,
    href: APP_ROUTES.WORKSPACE.ACTIVITY,
    label: 'Activity',
    matchPaths: [APP_ROUTES.WORKSPACE.ACTIVITY],
    outline: Clock,
    solid: Clock,
  },
];

export function getAppSecondaryMenuItems(
  _brandSlug?: string | null,
): MenuItemConfig[] {
  return [];
}

export const APP_LOGO_HREF = APP_ROUTES.WORKSPACE.OVERVIEW;
