import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  History,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  Network,
  Rocket,
  Send,
  Settings,
  Sparkles,
  UserPlus,
  Users,
  Workflow,
} from 'lucide-react';

/**
 * Automate module nav — grouped by usage (same pattern as Analytics / Settings).
 *
 * - Home: Overview
 * - Workflows: pipelines + run history
 * - Agents: roster, hire, skills, autopilot strategies
 * - Campaigns: content programs, outreach, reply drip, launch team
 * - Settings: module config
 *
 * Icons: one unique lucide glyph per row. Measurement lives in Analytics —
 * no Automate Analytics clone.
 */
export const AUTOMATE_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.AUTOMATE.OVERVIEW,
    label: 'Overview',
    matchPaths: [APP_ROUTES.AUTOMATE.ROOT, APP_ROUTES.AUTOMATE.OVERVIEW],
    outline: LayoutGrid,
    solid: LayoutGrid,
  },
  {
    group: 'Workflows',
    href: APP_ROUTES.AUTOMATE.WORKFLOWS,
    label: 'Workflows',
    matchPaths: [
      APP_ROUTES.AUTOMATE.WORKFLOWS,
      APP_ROUTES.AUTOMATE.WORKFLOWS_NEW,
      APP_ROUTES.AUTOMATE.WORKFLOWS_TEMPLATES,
    ],
    outline: Workflow,
    solid: Workflow,
  },
  {
    group: 'Workflows',
    href: APP_ROUTES.AUTOMATE.WORKFLOWS_EXECUTIONS,
    label: 'Runs',
    matchPaths: [
      APP_ROUTES.AUTOMATE.WORKFLOWS_EXECUTIONS,
      APP_ROUTES.AUTOMATE.RUNS,
      APP_ROUTES.AUTOMATE.CONTENT_RUNS,
    ],
    outline: History,
    solid: History,
  },
  {
    group: 'Agents',
    href: APP_ROUTES.AUTOMATE.LIBRARY,
    label: 'Team',
    matchPaths: [APP_ROUTES.AUTOMATE.LIBRARY, APP_ROUTES.AUTOMATE.NEW],
    outline: Users,
    solid: Users,
  },
  {
    group: 'Agents',
    href: APP_ROUTES.AUTOMATE.HIRE,
    label: 'Hire',
    matchPaths: [APP_ROUTES.AUTOMATE.HIRE],
    outline: UserPlus,
    solid: UserPlus,
  },
  {
    group: 'Agents',
    href: APP_ROUTES.AUTOMATE.SKILLS,
    label: 'Skills',
    matchPaths: [APP_ROUTES.AUTOMATE.SKILLS],
    outline: Sparkles,
    solid: Sparkles,
  },
  {
    group: 'Agents',
    href: APP_ROUTES.AUTOMATE.AUTOPILOT,
    label: 'Autopilot',
    matchPaths: [APP_ROUTES.AUTOMATE.AUTOPILOT, APP_ROUTES.AUTOMATE.STRATEGIES],
    outline: Rocket,
    solid: Rocket,
  },
  {
    group: 'Campaigns',
    href: APP_ROUTES.AUTOMATE.CAMPAIGNS,
    label: 'Campaigns',
    matchPaths: [
      APP_ROUTES.AUTOMATE.CAMPAIGNS,
      APP_ROUTES.AUTOMATE.CAMPAIGNS_NEW,
    ],
    outline: Megaphone,
    solid: Megaphone,
  },
  {
    group: 'Campaigns',
    href: APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS,
    label: 'Outreach',
    matchPaths: [
      APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS,
      APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS_NEW,
    ],
    outline: Send,
    solid: Send,
  },
  {
    group: 'Campaigns',
    href: APP_ROUTES.AUTOMATE.REPLY_CAMPAIGNS,
    label: 'Reply Campaigns',
    matchPaths: [APP_ROUTES.AUTOMATE.REPLY_CAMPAIGNS],
    outline: MessageSquare,
    solid: MessageSquare,
  },
  {
    group: 'Campaigns',
    href: APP_ROUTES.AUTOMATE.ORCHESTRATOR,
    label: 'Launch team',
    matchPaths: [APP_ROUTES.AUTOMATE.ORCHESTRATOR],
    outline: Network,
    solid: Network,
  },
  {
    group: 'Settings',
    href: APP_ROUTES.AUTOMATE.CONFIGURATION,
    label: 'Configuration',
    matchPaths: [APP_ROUTES.AUTOMATE.CONFIGURATION],
    outline: Settings,
    solid: Settings,
  },
];

/** The module logo returns to Automate's own overview, not the app-wide one. */
export const AUTOMATE_LOGO_HREF = APP_ROUTES.AUTOMATE.OVERVIEW;
