import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { PlayCircle, Rocket, Settings, Sparkles, Wrench } from 'lucide-react';

export const WORKFLOWS_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.WORKFLOWS.EXECUTIONS,
    label: 'Runs',
    matchPaths: [
      APP_ROUTES.WORKFLOWS.EXECUTIONS,
      APP_ROUTES.ORCHESTRATION.RUNS,
    ],
    outline: PlayCircle,
    solid: PlayCircle,
  },
  {
    group: '',
    href: APP_ROUTES.WORKFLOWS.ROOT,
    label: 'Workflows',
    matchPaths: [APP_ROUTES.ORCHESTRATION.WORKFLOWS, APP_ROUTES.WORKFLOWS.ROOT],
    outline: Wrench,
    solid: Wrench,
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
      APP_ROUTES.WORKFLOWS.AUTOPILOT,
      APP_ROUTES.ORCHESTRATION.AUTOPILOT,
      '/orchestration/strategies',
    ],
    outline: Rocket,
    solid: Rocket,
  },
  {
    group: '',
    href: APP_ROUTES.ORCHESTRATION.CONFIGURATION,
    label: 'Configuration',
    matchPaths: [
      APP_ROUTES.WORKFLOWS.CONFIGURATION,
      APP_ROUTES.ORCHESTRATION.CONFIGURATION,
    ],
    outline: Settings,
    solid: Settings,
  },
];

export const WORKFLOWS_LOGO_HREF = APP_ROUTES.OVERVIEW.ROOT;
