import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  HiCog6Tooth,
  HiOutlineCog6Tooth,
  HiOutlinePlayCircle,
  HiOutlineRocketLaunch,
  HiOutlineSparkles,
  HiOutlineWrenchScrewdriver,
  HiPlayCircle,
  HiRocketLaunch,
  HiSparkles,
  HiWrenchScrewdriver,
} from 'react-icons/hi2';

export const WORKFLOWS_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.WORKFLOWS.EXECUTIONS,
    label: 'Runs',
    matchPaths: [
      APP_ROUTES.WORKFLOWS.EXECUTIONS,
      APP_ROUTES.ORCHESTRATION.RUNS,
    ],
    outline: HiOutlinePlayCircle,
    solid: HiPlayCircle,
  },
  {
    group: '',
    href: APP_ROUTES.WORKFLOWS.ROOT,
    label: 'Workflows',
    matchPaths: [APP_ROUTES.ORCHESTRATION.WORKFLOWS, APP_ROUTES.WORKFLOWS.ROOT],
    outline: HiOutlineWrenchScrewdriver,
    solid: HiWrenchScrewdriver,
  },
  {
    group: '',
    href: APP_ROUTES.ORCHESTRATION.SKILLS,
    label: 'Skills',
    matchPaths: [APP_ROUTES.ORCHESTRATION.SKILLS],
    outline: HiOutlineSparkles,
    solid: HiSparkles,
  },
  {
    group: '',
    href: APP_ROUTES.WORKFLOWS.AUTOPILOT,
    label: 'Autopilot',
    matchPaths: [
      APP_ROUTES.WORKFLOWS.AUTOPILOT,
      APP_ROUTES.ORCHESTRATION.AUTOPILOT,
      '/orchestration/strategies',
    ],
    outline: HiOutlineRocketLaunch,
    solid: HiRocketLaunch,
  },
  {
    group: '',
    href: APP_ROUTES.WORKFLOWS.CONFIGURATION,
    label: 'Configuration',
    matchPaths: [
      APP_ROUTES.WORKFLOWS.CONFIGURATION,
      APP_ROUTES.ORCHESTRATION.CONFIGURATION,
    ],
    outline: HiOutlineCog6Tooth,
    solid: HiCog6Tooth,
  },
];

export const WORKFLOWS_LOGO_HREF = APP_ROUTES.OVERVIEW.ROOT;
