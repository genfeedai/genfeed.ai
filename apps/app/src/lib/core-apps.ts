import { APP_DISPLAY_LABELS, APP_ROUTES } from '@genfeedai/contracts/constants';

export type CoreAppId = 'agent' | 'automation' | 'studio';

export interface CoreAppDefinition {
  description: string;
  href: `/${string}`;
  id: CoreAppId;
  label: string;
  shortLabel: string;
}

export const CORE_APPS: CoreAppDefinition[] = [
  {
    description:
      'Control content creation from a full-page agent conversation.',
    href: APP_ROUTES.AGENT.ROOT,
    id: 'agent',
    label: APP_DISPLAY_LABELS.agent,
    shortLabel: APP_DISPLAY_LABELS.agent,
  },
  {
    description: 'Workflows, agents, and your automated content team.',
    href: APP_ROUTES.AUTOMATION.ROOT,
    id: 'automation',
    label: APP_DISPLAY_LABELS.automation,
    shortLabel: APP_DISPLAY_LABELS.automation,
  },
  {
    description:
      'Generate assets, then produce storyboards, clips, batches, and timeline edits at production scale.',
    href: APP_ROUTES.STUDIO.PLAYGROUND,
    id: 'studio',
    label: APP_DISPLAY_LABELS.studio,
    shortLabel: APP_DISPLAY_LABELS.studio,
  },
];
