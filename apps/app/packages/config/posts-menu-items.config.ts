import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  Calendar,
  ClipboardCheck,
  FileText,
  List,
  Mail,
  Megaphone,
  Rocket,
  Send,
  Sparkles,
} from 'lucide-react';

// No Analytics entry: the Analytics module owns every analytics surface, and
// this module's former `/posts/analytics` page is retired in favor of
// `/analytics/posts`.
export const POSTS_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.POSTS.ROOT,
    label: 'All posts',
    matchPaths: [APP_ROUTES.POSTS.ROOT],
    outline: FileText,
    solid: FileText,
  },
  {
    group: '',
    href: APP_ROUTES.POSTS.REVIEW,
    label: 'Review',
    matchPaths: [APP_ROUTES.POSTS.REVIEW],
    outline: ClipboardCheck,
    solid: ClipboardCheck,
  },
  {
    group: '',
    href: APP_ROUTES.POSTS.SCHEDULED,
    label: 'Scheduled',
    matchPaths: [APP_ROUTES.POSTS.SCHEDULED],
    outline: List,
    solid: List,
  },
  {
    group: '',
    href: APP_ROUTES.POSTS.PUBLISHED,
    label: 'Published',
    matchPaths: [APP_ROUTES.POSTS.PUBLISHED],
    outline: Send,
    solid: Send,
  },
  {
    group: '',
    href: APP_ROUTES.POSTS.CALENDAR,
    label: 'Calendar',
    matchPaths: [APP_ROUTES.POSTS.CALENDAR],
    outline: Calendar,
    solid: Calendar,
  },
  {
    group: '',
    hasDividerAbove: true,
    href: APP_ROUTES.POSTS.CAMPAIGNS,
    label: 'Campaigns',
    matchPaths: [APP_ROUTES.POSTS.CAMPAIGNS],
    outline: Megaphone,
    solid: Megaphone,
  },
  {
    group: '',
    href: APP_ROUTES.POSTS.OUTREACH_CAMPAIGNS,
    label: 'Outreach',
    matchPaths: [APP_ROUTES.POSTS.OUTREACH_CAMPAIGNS],
    outline: Rocket,
    solid: Rocket,
  },
  {
    group: '',
    hasDividerAbove: true,
    href: APP_ROUTES.POSTS.NEWSLETTERS,
    label: 'Newsletters',
    matchPaths: [APP_ROUTES.POSTS.NEWSLETTERS],
    outline: Mail,
    solid: Mail,
  },
  {
    group: '',
    href: APP_ROUTES.POSTS.REMIX,
    label: 'Remix',
    matchPaths: [APP_ROUTES.POSTS.REMIX],
    outline: Sparkles,
    solid: Sparkles,
  },
];

export const POSTS_LOGO_HREF = APP_ROUTES.POSTS.ROOT;
