import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  ChartColumn,
  CirclePlay,
  Megaphone,
  Rocket,
  Settings,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';

/**
 * Automate module nav — grouped by product surface (not a flat dump).
 *
 * - Home: Overview
 * - Build: pipelines + run history
 * - Campaigns: reply drip (and future campaign types)
 * - Agents: team, skills, autopilot strategies
 * - Insights / Settings: analytics + module config
 */
export const AUTOMATE_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.AUTOMATE.OVERVIEW,
    label: 'Overview',
    matchPaths: [APP_ROUTES.AUTOMATE.ROOT, APP_ROUTES.AUTOMATE.OVERVIEW],
    outline: Sparkles,
    solid: Sparkles,
  },
  {
    group: 'Build',
    href: APP_ROUTES.AUTOMATE.WORKFLOWS,
    label: 'Workflows',
    matchPaths: [
      APP_ROUTES.AUTOMATE.WORKFLOWS,
      APP_ROUTES.AUTOMATE.WORKFLOWS_NEW,
      APP_ROUTES.AUTOMATE.WORKFLOWS_TEMPLATES,
    ],
    outline: Wrench,
    solid: Wrench,
  },
  {
    group: 'Build',
    href: APP_ROUTES.AUTOMATE.WORKFLOWS_EXECUTIONS,
    label: 'Runs',
    matchPaths: [
      APP_ROUTES.AUTOMATE.WORKFLOWS_EXECUTIONS,
      APP_ROUTES.AUTOMATE.RUNS,
      APP_ROUTES.AUTOMATE.CONTENT_RUNS,
    ],
    outline: CirclePlay,
    solid: CirclePlay,
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
    group: 'Agents',
    href: APP_ROUTES.AUTOMATE.LIBRARY,
    label: 'Team',
    matchPaths: [
      APP_ROUTES.AUTOMATE.LIBRARY,
      APP_ROUTES.AUTOMATE.HIRE,
      APP_ROUTES.AUTOMATE.ORCHESTRATOR,
      APP_ROUTES.AUTOMATE.NEW,
    ],
    outline: Users,
    solid: Users,
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
    group: 'Insights',
    href: APP_ROUTES.AUTOMATE.ANALYTICS,
    label: 'Analytics',
    matchPaths: [APP_ROUTES.AUTOMATE.ANALYTICS],
    outline: ChartColumn,
    solid: ChartColumn,
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
