import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  HiCalendar,
  HiChartBar,
  HiClipboardDocumentCheck,
  HiClipboardDocumentList,
  HiClock,
  HiCog6Tooth,
  HiDocumentText,
  HiFolder,
  HiInboxStack,
  HiMicrophone,
  HiMusicalNote,
  HiOutlineCalendar,
  HiOutlineChartBar,
  HiOutlineClipboardDocumentCheck,
  HiOutlineClipboardDocumentList,
  HiOutlineClock,
  HiOutlineCog6Tooth,
  HiOutlineDocumentText,
  HiOutlineFolder,
  HiOutlineInboxStack,
  HiOutlineMicrophone,
  HiOutlineMusicalNote,
  HiOutlinePhoto,
  HiOutlinePlayCircle,
  HiOutlineSquares2X2,
  HiPhoto,
  HiPlayCircle,
  HiSquares2X2,
} from 'react-icons/hi2';

/** Label after which dynamic credential items are inserted in the Posts group */
export const POSTS_INSERT_AFTER_LABEL = 'Review';

export enum AppMenuGroup {
  Root = '',
  Library = 'Library',
  Posts = 'Posts',
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
    drillDown: true,
    group: AppMenuGroup.Library,
    href: '/library/ingredients',
    label: 'Library',
    matchPaths: ['/library', '/library/ingredients'],
    outline: HiOutlineFolder,
    solid: HiFolder,
  },
  {
    group: AppMenuGroup.Library,
    href: '/library/images',
    label: 'Images',
    matchPaths: ['/library/images'],
    outline: HiOutlinePhoto,
    solid: HiPhoto,
  },
  {
    group: AppMenuGroup.Library,
    href: '/library/videos',
    label: 'Videos',
    matchPaths: ['/library/videos'],
    outline: HiOutlineDocumentText,
    solid: HiDocumentText,
  },
  {
    group: AppMenuGroup.Library,
    href: '/library/gifs',
    label: 'GIFs',
    matchPaths: ['/library/gifs'],
    outline: HiOutlinePlayCircle,
    solid: HiPlayCircle,
  },
  {
    group: AppMenuGroup.Library,
    href: '/library/voices',
    label: 'Voices',
    matchPaths: ['/library/voices'],
    outline: HiOutlineMicrophone,
    solid: HiMicrophone,
  },
  {
    group: AppMenuGroup.Library,
    href: '/library/music',
    label: 'Music',
    matchPaths: ['/library/music'],
    outline: HiOutlineMusicalNote,
    solid: HiMusicalNote,
  },
  {
    group: AppMenuGroup.Library,
    href: '/library/captions',
    label: 'Captions',
    matchPaths: ['/library/captions', '/captions'],
    outline: HiOutlineDocumentText,
    solid: HiDocumentText,
  },
  {
    drillDown: true,
    group: AppMenuGroup.Posts,
    href: '/posts/analytics',
    label: 'Analytics',
    matchPaths: ['/posts/analytics'],
    outline: HiOutlineChartBar,
    solid: HiChartBar,
  },
  {
    group: AppMenuGroup.Posts,
    href: '/posts/remix',
    label: 'Remix',
    matchPaths: ['/posts/remix'],
    outline: HiOutlinePlayCircle,
    solid: HiPlayCircle,
  },
  {
    group: AppMenuGroup.Posts,
    href: '/posts/calendar',
    label: 'Calendar',
    matchPaths: ['/posts/calendar'],
    outline: HiOutlineCalendar,
    solid: HiCalendar,
  },
  {
    group: AppMenuGroup.Posts,
    href: '/posts/review',
    label: 'Review',
    matchPaths: ['/posts/review'],
    outline: HiOutlineClipboardDocumentCheck,
    solid: HiClipboardDocumentCheck,
  },
  {
    group: AppMenuGroup.Posts,
    href: '/posts',
    label: 'Posts',
    matchPaths: ['/posts'],
    outline: HiOutlineDocumentText,
    solid: HiDocumentText,
  },
];

export const APP_SECONDARY_MENU_ITEMS: MenuItemConfig[] = [
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
  brandId?: string | null,
): MenuItemConfig[] {
  if (!brandId) {
    return APP_SECONDARY_MENU_ITEMS;
  }

  return [
    ...APP_SECONDARY_MENU_ITEMS,
    {
      group: AppMenuGroup.Root,
      href: `/settings/brands/${brandId}`,
      label: 'Settings',
      matchPaths: [`/settings/brands/${brandId}`],
      outline: HiOutlineCog6Tooth,
      solid: HiCog6Tooth,
    },
  ];
}

export const APP_LOGO_HREF = '/workspace/overview';
