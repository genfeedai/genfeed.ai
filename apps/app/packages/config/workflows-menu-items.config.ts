import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  CirclePlay,
  Megaphone,
  Rocket,
  Settings,
  Sparkles,
  Wrench,
} from 'lucide-react';

export const WORKFLOWS_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.ORCHESTRATION.OVERVIEW,
    label: 'Overview',
    matchPaths: [APP_ROUTES.ORCHESTRATION.OVERVIEW],
    outline: Sparkles,
    solid: Sparkles,
  },
  {
    group: '',
    href: APP_ROUTES.ORCHESTRATION.WORKFLOWS,
    label: 'Workflows',
    matchPaths: [APP_ROUTES.ORCHESTRATION.WORKFLOWS],
    outline: Wrench,
    solid: Wrench,
  },
  {
    group: '',
    href: APP_ROUTES.ORCHESTRATION.REPLY_CAMPAIGNS,
    label: 'Reply Campaigns',
    matchPaths: [APP_ROUTES.ORCHESTRATION.REPLY_CAMPAIGNS],
    outline: Megaphone,
    solid: Megaphone,
  },
  {
    group: '',
    href: APP_ROUTES.ORCHESTRATION.WORKFLOWS_EXECUTIONS,
    label: 'Runs',
    matchPaths: [
      APP_ROUTES.ORCHESTRATION.WORKFLOWS_EXECUTIONS,
      APP_ROUTES.ORCHESTRATION.RUNS,
    ],
    outline: CirclePlay,
    solid: CirclePlay,
  },
  {
    group: '',
    href: APP_ROUTES.ORCHESTRATION.SKILLS,
    label: 'Skills',
    matchPaths: [APP_ROUTES.ORCHESTRATION.SKILLS],
    outline: Sparkles,
    solid: Sparkles,
  },
  {
    group: '',
    href: APP_ROUTES.ORCHESTRATION.AUTOPILOT,
    label: 'Autopilot',
    matchPaths: [
      APP_ROUTES.ORCHESTRATION.AUTOPILOT,
      APP_ROUTES.ORCHESTRATION.STRATEGIES,
    ],
    outline: Rocket,
    solid: Rocket,
  },
  {
    group: '',
    href: APP_ROUTES.ORCHESTRATION.CONFIGURATION,
    label: 'Configuration',
    matchPaths: [APP_ROUTES.ORCHESTRATION.CONFIGURATION],
    outline: Settings,
    solid: Settings,
  },
];

export const WORKFLOWS_LOGO_HREF = APP_ROUTES.OVERVIEW.ROOT;
