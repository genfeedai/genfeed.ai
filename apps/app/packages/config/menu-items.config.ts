import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { Activity, ClipboardCheck, Gauge, Mail } from 'lucide-react';

/** Label after which dynamic credential items are inserted */
export const PUBLISHING_INSERT_AFTER_LABEL = 'Posts';

export enum AppMenuGroup {
  Root = '',
}

export const APP_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: AppMenuGroup.Root,
    href: APP_ROUTES.WORKSPACE.OVERVIEW,
    label: 'Overview',
    matchPaths: [APP_ROUTES.WORKSPACE.ROOT, APP_ROUTES.WORKSPACE.OVERVIEW],
    outline: Gauge,
    solid: Gauge,
  },
  {
    group: AppMenuGroup.Root,
    href: APP_ROUTES.WORKSPACE.INBOX,
    label: 'Inbox',
    matchPaths: [
      APP_ROUTES.WORKSPACE.INBOX,
      APP_ROUTES.WORKSPACE.INBOX_UNREAD,
      APP_ROUTES.WORKSPACE.INBOX_RECENT,
      APP_ROUTES.WORKSPACE.INBOX_ALL,
    ],
    outline: Mail,
    solid: Mail,
  },
  {
    group: AppMenuGroup.Root,
    href: APP_ROUTES.WORKSPACE.TASKS,
    label: 'Tasks',
    matchPaths: [APP_ROUTES.WORKSPACE.TASKS],
    outline: ClipboardCheck,
    solid: ClipboardCheck,
  },
  {
    group: AppMenuGroup.Root,
    href: APP_ROUTES.WORKSPACE.ACTIVITY,
    label: 'Activity',
    matchPaths: [APP_ROUTES.WORKSPACE.ACTIVITY],
    outline: Activity,
    solid: Activity,
  },
];

export function getAppSecondaryMenuItems(
  _brandSlug?: string | null,
): MenuItemConfig[] {
  return [];
}
