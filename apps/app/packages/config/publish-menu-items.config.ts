import {
  APP_ROUTES,
  createPublishPostsFilterRoute,
  PUBLISH_POSTS_QUERY_KEYS,
} from '@genfeedai/constants';
import { PostStatus } from '@genfeedai/enums';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  Calendar,
  ClipboardCheck,
  LayoutDashboard,
  List,
  Rows3,
  Send,
} from 'lucide-react';

/**
 * Publish owns the content desk + go-live lifecycle.
 *
 * Top: Overview · Posts · Calendar
 * Pipeline: Review · Drafts · Published (status shortcuts into the desk)
 *
 * Campaigns / outreach → Automate. Remix → Discover/Library action only.
 * Newsletter create UX is not nav here (legacy deep link only).
 */
export const PUBLISH_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.PUBLISH.OVERVIEW,
    isExactMatch: true,
    label: 'Overview',
    matchPaths: [APP_ROUTES.PUBLISH.OVERVIEW, APP_ROUTES.PUBLISH.ROOT],
    outline: LayoutDashboard,
    solid: LayoutDashboard,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISH.POSTS,
    label: 'Posts',
    matchPaths: [APP_ROUTES.PUBLISH.POSTS],
    outline: Rows3,
    solid: Rows3,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISH.CALENDAR,
    label: 'Calendar',
    matchPaths: [APP_ROUTES.PUBLISH.CALENDAR],
    outline: Calendar,
    solid: Calendar,
  },
  {
    group: 'Pipeline',
    href: createPublishPostsFilterRoute({ status: PostStatus.DRAFT }),
    isCollapsible: true,
    label: 'Review',
    matchPaths: [APP_ROUTES.PUBLISH.POSTS],
    matchSearchParams: {
      [PUBLISH_POSTS_QUERY_KEYS.STATUS]: PostStatus.DRAFT,
    },
    outline: ClipboardCheck,
    solid: ClipboardCheck,
  },
  {
    group: 'Pipeline',
    href: createPublishPostsFilterRoute({
      publicationState: 'not-posted',
    }),
    label: 'Drafts',
    matchPaths: [APP_ROUTES.PUBLISH.POSTS],
    matchSearchParams: {
      [PUBLISH_POSTS_QUERY_KEYS.PUBLICATION_STATE]: 'not-posted',
      [PUBLISH_POSTS_QUERY_KEYS.STATUS]: null,
    },
    outline: List,
    solid: List,
  },
  {
    group: 'Pipeline',
    href: createPublishPostsFilterRoute({ publicationState: 'posted' }),
    label: 'Published',
    matchPaths: [APP_ROUTES.PUBLISH.POSTS],
    matchSearchParams: {
      [PUBLISH_POSTS_QUERY_KEYS.PUBLICATION_STATE]: 'posted',
      [PUBLISH_POSTS_QUERY_KEYS.STATUS]: null,
    },
    outline: Send,
    solid: Send,
  },
];

export const PUBLISH_LOGO_HREF = APP_ROUTES.PUBLISH.OVERVIEW;
