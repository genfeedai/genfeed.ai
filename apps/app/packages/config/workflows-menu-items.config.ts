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
    href: '/workflows/executions',
    label: 'Runs',
    matchPaths: ['/workflows/executions', '/orchestration/runs'],
    outline: HiOutlinePlayCircle,
    solid: HiPlayCircle,
  },
  {
    group: '',
    href: '/workflows',
    label: 'Workflows',
    matchPaths: ['/orchestration/workflows', '/workflows'],
    outline: HiOutlineWrenchScrewdriver,
    solid: HiWrenchScrewdriver,
  },
  {
    group: '',
    href: '/orchestration/skills',
    label: 'Skills',
    matchPaths: ['/orchestration/skills'],
    outline: HiOutlineSparkles,
    solid: HiSparkles,
  },
  {
    group: '',
    href: '/workflows/autopilot',
    label: 'Autopilot',
    matchPaths: [
      '/workflows/autopilot',
      '/orchestration/autopilot',
      '/orchestration/strategies',
    ],
    outline: HiOutlineRocketLaunch,
    solid: HiRocketLaunch,
  },
  {
    group: '',
    href: '/workflows/configuration',
    label: 'Configuration',
    matchPaths: ['/workflows/configuration', '/orchestration/configuration'],
    outline: HiOutlineCog6Tooth,
    solid: HiCog6Tooth,
  },
];

export const WORKFLOWS_LOGO_HREF = '/overview';
