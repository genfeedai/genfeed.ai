import { ROUTE_MANIFEST_ADMIN_PAGES } from '@genfeedai/contracts/constants';
import type { AdminMenuItemConfig } from '@genfeedai/contracts/interfaces/ui/app-rail.interface';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import { PostCard } from '@ui/primitives/animated-icons/custom-lucide';
import {
  AArrowUp,
  Activity,
  AudioLines,
  Bell,
  Binary,
  Bookmark,
  BookmarkCheck,
  Bot,
  Box,
  BriefcaseBusiness,
  Building2,
  ChartPie,
  CircleDollarSign,
  Cog,
  Cpu,
  CreditCard,
  FileStack,
  FileText,
  Film,
  FolderOpen,
  Gauge,
  GraduationCap,
  HandCoins,
  HandHeart,
  Layers,
  LibraryBig,
  Radio,
  Send,
  Server,
  ServerCrash,
  Shapes,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  UsersRound,
  Workflow,
} from 'lucide-react';

/** Sidebar icons by menu entry id (`menu.id` on the route manifest page). */
const ADMIN_MENU_ICONS: Readonly<Record<string, IconComponent>> = {
  'affiliate-rewards': HandHeart,
  'agent-failures': ServerCrash,
  'font-families': AArrowUp,
  'unit-economics': CircleDollarSign,
  'voice-library': AudioLines,
  activities: Activity,
  agent: Bot,
  agents: Bot,
  ai: Shapes,
  analytics: ChartPie,
  announcements: Radio,
  billing: FileText,
  bots: Bot,
  brands: BriefcaseBusiness,
  business: HandCoins,
  costs: Layers,
  elements: Box,
  flags: Binary,
  folders: FolderOpen,
  generations: Sparkles,
  ingredients: LibraryBig,
  learning: Cog,
  media: Film,
  models: Cpu,
  notifications: Bell,
  organizations: Building2,
  overview: Gauge,
  posts: PostCard,
  presets: BookmarkCheck,
  providers: Server,
  revenue: TrendingUp,
  roles: UserCheck,
  subscriptions: CreditCard,
  summary: Gauge,
  tags: Bookmark,
  templates: FileStack,
  trainings: GraduationCap,
  users: Users,
  accounts: UsersRound,
  workflows: Workflow,
  'system-emails': Send,
};

/**
 * Each `category` is an admin rail icon (`ADMIN_RAIL_CATEGORIES`); the sidebar
 * lists only the active category, and `group` is the header a page sits under.
 * Pages in one group stay adjacent: the sidebar starts a new header whenever
 * the group changes. Derived from the admin pages of the route manifest, in
 * manifest order.
 */
export const ADMIN_MENU_ITEMS: AdminMenuItemConfig[] =
  ROUTE_MANIFEST_ADMIN_PAGES.flatMap(({ menu, path }) => {
    if (!menu) {
      return [];
    }

    const icon = ADMIN_MENU_ICONS[menu.id];

    return {
      category: menu.category,
      group: menu.group,
      href: path,
      hrefScope: 'global',
      isExactMatch: menu.isExactMatch,
      label: menu.label,
      matchPaths: [...(menu.matchPaths ?? [path])],
      outline: icon,
      solid: icon,
    };
  });

/**
 * Sidebar group headers collapse when the group's first item carries
 * `isCollapsible`. Items without a group render flat and stay as they are.
 */
export function withCollapsibleAdminGroups<T extends AdminMenuItemConfig>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  return items.map((item) => {
    if (!item.group || seen.has(item.group)) return item;
    seen.add(item.group);
    return { ...item, isCollapsible: true };
  });
}
