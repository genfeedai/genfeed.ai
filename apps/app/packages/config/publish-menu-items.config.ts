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
// this module's former analytics page is retired in favor of
// `/analytics/posts`.
export const PUBLISH_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.PUBLISH.ROOT,
    label: 'All posts',
    matchPaths: [APP_ROUTES.PUBLISH.ROOT],
    outline: FileText,
    solid: FileText,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISH.REVIEW,
    label: 'Review',
    matchPaths: [APP_ROUTES.PUBLISH.REVIEW],
    outline: ClipboardCheck,
    solid: ClipboardCheck,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISH.SCHEDULED,
    label: 'Scheduled',
    matchPaths: [APP_ROUTES.PUBLISH.SCHEDULED],
    outline: List,
    solid: List,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISH.PUBLISHED,
    label: 'Published',
    matchPaths: [APP_ROUTES.PUBLISH.PUBLISHED],
    outline: Send,
    solid: Send,
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
    group: '',
    hasDividerAbove: true,
    href: APP_ROUTES.PUBLISH.CAMPAIGNS,
    label: 'Campaigns',
    matchPaths: [APP_ROUTES.PUBLISH.CAMPAIGNS],
    outline: Megaphone,
    solid: Megaphone,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISH.OUTREACH_CAMPAIGNS,
    label: 'Outreach',
    matchPaths: [APP_ROUTES.PUBLISH.OUTREACH_CAMPAIGNS],
    outline: Rocket,
    solid: Rocket,
  },
  {
    group: '',
    hasDividerAbove: true,
    href: APP_ROUTES.PUBLISH.NEWSLETTERS,
    label: 'Newsletters',
    matchPaths: [APP_ROUTES.PUBLISH.NEWSLETTERS],
    outline: Mail,
    solid: Mail,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISH.REMIX,
    label: 'Remix',
    matchPaths: [APP_ROUTES.PUBLISH.REMIX],
    outline: Sparkles,
    solid: Sparkles,
  },
];

export const PUBLISH_LOGO_HREF = APP_ROUTES.PUBLISH.ROOT;
