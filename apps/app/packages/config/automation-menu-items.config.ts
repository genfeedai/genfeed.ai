import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { History, LayoutGrid, Megaphone, Users, Workflow } from 'lucide-react';

/**
 * Automation module nav — flat under the Automation app chrome (same shape as
 * Studio / Publishing / Workspace). Overview, workflows, runs, agents and
 * programs are sibling rows; schedule and autonomy live on the agent.
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
    group: '',
    href: APP_ROUTES.AUTOMATION.WORKFLOWS,
    label: 'Workflows',
    matchPaths: [
      APP_ROUTES.AUTOMATION.TEMPLATES,
      APP_ROUTES.AUTOMATION.WORKFLOWS,
      APP_ROUTES.AUTOMATION.WORKFLOWS_NEW,
      APP_ROUTES.AUTOMATION.WORKFLOWS_TEMPLATES,
    ],
    outline: Workflow,
    solid: Workflow,
  },
  {
    group: '',
    href: APP_ROUTES.AUTOMATION.RUNS,
    label: 'Runs',
    matchPaths: [
      APP_ROUTES.AUTOMATION.RUNS,
      APP_ROUTES.AUTOMATION.CONTENT_RUNS,
    ],
    outline: History,
    solid: History,
  },
  {
    group: '',
    href: APP_ROUTES.AUTOMATION.AGENTS,
    label: 'Agents',
    matchPaths: [APP_ROUTES.AUTOMATION.AGENTS],
    outline: Users,
    solid: Users,
  },
  {
    group: '',
    href: APP_ROUTES.AUTOMATION.CAMPAIGNS,
    label: 'Programs',
    matchPaths: [
      APP_ROUTES.AUTOMATION.CAMPAIGNS,
      APP_ROUTES.AUTOMATION.CAMPAIGNS_NEW,
    ],
    outline: Megaphone,
    solid: Megaphone,
  },
];
