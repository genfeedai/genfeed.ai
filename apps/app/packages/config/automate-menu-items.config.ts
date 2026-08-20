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
 * - Agents: roster, hire, skills, autopilot, programs, launch team
 * - Settings: module config
 *
 * Outreach / reply drip / author replies live in Messages.
 * Marketer multi-platform content Campaigns belong in Publish (P1).
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
    href: APP_ROUTES.AUTOMATE.AGENTS,
    label: 'Team',
    matchPaths: [
      APP_ROUTES.AUTOMATE.AGENTS,
      APP_ROUTES.AUTOMATE.NEW,
      APP_ROUTES.AUTOMATE.LIBRARY,
      '/automate/new',
    ],
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
    matchPaths: [APP_ROUTES.AUTOMATE.AUTOPILOT],
    outline: Rocket,
    solid: Rocket,
  },
  {
    group: 'Agents',
    href: APP_ROUTES.AUTOMATE.CAMPAIGNS,
    label: 'Programs',
    matchPaths: [
      APP_ROUTES.AUTOMATE.CAMPAIGNS,
      APP_ROUTES.AUTOMATE.CAMPAIGNS_NEW,
    ],
    outline: Megaphone,
    solid: Megaphone,
  },
  {
    group: 'Agents',
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
