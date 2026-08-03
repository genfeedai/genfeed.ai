import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  History,
  LayoutGrid,
  Megaphone,
  Network,
  Rocket,
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
 * - Campaigns: reply drip + multi-agent launch (orchestrator)
 * - Settings: module config
 *
 * Icons: one unique lucide glyph per row, from the same set used across app
 * menus (LayoutGrid for Overview, Megaphone for campaigns, Settings for config).
 * Measurement lives in the Analytics app — no Automate Analytics clone.
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
    href: APP_ROUTES.AUTOMATE.REPLY_CAMPAIGNS,
    label: 'Reply Campaigns',
    matchPaths: [APP_ROUTES.AUTOMATE.REPLY_CAMPAIGNS],
    outline: Megaphone,
    solid: Megaphone,
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
