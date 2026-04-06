export type CoreAppId = 'workflows' | 'studio' | 'editor';

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
      'Build reusable node-based automation pipelines and manage saved workflows.',
    href: '/workflows',
    id: 'workflows',
    label: 'Workflows',
    shortLabel: 'Flows',
  },
  {
    description:
      'Generate image and video assets quickly with a prompt bar and Replicate models.',
    href: '/studio',
    id: 'studio',
    label: 'Studio',
    shortLabel: 'Studio',
  },
  {
    description:
      'Compose and export media from generated assets using a Remotion-based editor.',
    href: '/editor',
    id: 'editor',
    label: 'Editor',
    shortLabel: 'Editor',
  },
];

export function getCoreAppById(id: CoreAppId): CoreAppDefinition {
  const app = CORE_APPS.find((entry) => entry.id === id);

  if (!app) {
    throw new Error(`Unknown core app: ${id}`);
  }

  return app;
}
