import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  History,
  LayoutGrid,
  Megaphone,
  Rocket,
  Users,
  Workflow,
} from 'lucide-react';

/**
 * Automation module nav — grouped by usage (same pattern as Analytics / Settings).
 *
 * - Home: Overview
 * - Workflows: pipelines + run history
 * - Agents: roster, autopilot, programs
 *
 * Outreach / reply drip / author replies live in Messages.
 * Marketer multi-platform content Campaigns belong in Publishing (P1).
 *
 * Icons: one unique lucide glyph per row. Measurement lives in Analytics —
 * no Automation Analytics clone.
 */
export const AUTOMATION_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.AUTOMATION.OVERVIEW,
    label: 'Overview',
    matchPaths: [APP_ROUTES.AUTOMATION.ROOT, APP_ROUTES.AUTOMATION.OVERVIEW],
    outline: LayoutGrid,
    solid: LayoutGrid,
  },
  {
    group: 'Workflows',
    href: APP_ROUTES.AUTOMATION.WORKFLOWS,
    label: 'Workflows',
    matchPaths: [
      APP_ROUTES.AUTOMATION.WORKFLOWS,
      APP_ROUTES.AUTOMATION.WORKFLOWS_NEW,
      APP_ROUTES.AUTOMATION.WORKFLOWS_TEMPLATES,
    ],
    outline: Workflow,
    solid: Workflow,
  },
  {
    group: 'Workflows',
    href: APP_ROUTES.AUTOMATION.WORKFLOWS_EXECUTIONS,
    label: 'Runs',
    matchPaths: [
      APP_ROUTES.AUTOMATION.WORKFLOWS_EXECUTIONS,
      APP_ROUTES.AUTOMATION.RUNS,
      APP_ROUTES.AUTOMATION.CONTENT_RUNS,
    ],
    outline: History,
    solid: History,
  },
  {
    group: 'Agents',
    href: APP_ROUTES.AUTOMATION.AGENTS,
    label: 'Agents',
    matchPaths: [
      APP_ROUTES.AUTOMATION.AGENTS,
      APP_ROUTES.AUTOMATION.HIRE,
      APP_ROUTES.AUTOMATION.NEW,
      APP_ROUTES.AUTOMATION.LIBRARY,
      '/automation/new',
    ],
    outline: Users,
    solid: Users,
  },
  {
    group: 'Agents',
    href: APP_ROUTES.AUTOMATION.AUTOPILOT,
    label: 'Autopilot',
    matchPaths: [APP_ROUTES.AUTOMATION.AUTOPILOT],
    outline: Rocket,
    solid: Rocket,
  },
  {
    group: 'Agents',
    href: APP_ROUTES.AUTOMATION.CAMPAIGNS,
    label: 'Programs',
    matchPaths: [
      APP_ROUTES.AUTOMATION.CAMPAIGNS,
      APP_ROUTES.AUTOMATION.CAMPAIGNS_NEW,
      APP_ROUTES.AUTOMATION.ORCHESTRATOR,
    ],
    outline: Megaphone,
    solid: Megaphone,
  },
];

/** The module logo returns to Automation's own overview. */
export const AUTOMATION_LOGO_HREF = APP_ROUTES.AUTOMATION.OVERVIEW;
