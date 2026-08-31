import {
  APP_ROUTES,
  createPublishingPostsFilterRoute,
  PUBLISHING_POSTS_QUERY_KEYS,
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
 * Publishing owns the content desk + go-live lifecycle.
 *
 * Top: Overview · Posts · Calendar
 * Pipeline: Review · Drafts · Published (status shortcuts into the desk)
 *
 * Agent Programs → Automation. Outreach / reply drip → Messages.
 * Marketer multi-platform content Campaigns → Publishing (P1).
 * Remix → Discovery/Library action only.
 * Newsletter writing → Agent; only its go-live lifecycle belongs here.
 */
export const PUBLISHING_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.OVERVIEW,
    isExactMatch: true,
    label: 'Overview',
    matchPaths: [APP_ROUTES.PUBLISHING.OVERVIEW, APP_ROUTES.PUBLISHING.ROOT],
    outline: LayoutDashboard,
    solid: LayoutDashboard,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.POSTS,
    label: 'Posts',
    matchPaths: [APP_ROUTES.PUBLISHING.POSTS],
    outline: Rows3,
    solid: Rows3,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.CALENDAR,
    label: 'Calendar',
    matchPaths: [APP_ROUTES.PUBLISHING.CALENDAR],
    outline: Calendar,
    solid: Calendar,
  },
  {
    group: 'Pipeline',
    href: createPublishingPostsFilterRoute({ status: PostStatus.DRAFT }),
    isCollapsible: true,
    label: 'Review',
    matchPaths: [APP_ROUTES.PUBLISHING.POSTS],
    matchSearchParams: {
      [PUBLISHING_POSTS_QUERY_KEYS.STATUS]: PostStatus.DRAFT,
    },
    outline: ClipboardCheck,
    solid: ClipboardCheck,
  },
  {
    group: 'Pipeline',
    href: createPublishingPostsFilterRoute({
      publicationState: 'not-posted',
    }),
    label: 'Drafts',
    matchPaths: [APP_ROUTES.PUBLISHING.POSTS],
    matchSearchParams: {
      [PUBLISHING_POSTS_QUERY_KEYS.PUBLICATION_STATE]: 'not-posted',
      [PUBLISHING_POSTS_QUERY_KEYS.STATUS]: null,
    },
    outline: List,
    solid: List,
  },
  {
    group: 'Pipeline',
    href: createPublishingPostsFilterRoute({ publicationState: 'posted' }),
    label: 'Published',
    matchPaths: [APP_ROUTES.PUBLISHING.POSTS],
    matchSearchParams: {
      [PUBLISHING_POSTS_QUERY_KEYS.PUBLICATION_STATE]: 'posted',
      [PUBLISHING_POSTS_QUERY_KEYS.STATUS]: null,
    },
    outline: Send,
    solid: Send,
  },
];

export const PUBLISHING_LOGO_HREF = APP_ROUTES.PUBLISHING.OVERVIEW;
