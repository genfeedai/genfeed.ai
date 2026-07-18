import { isSaaS } from '@genfeedai/config/deployment';
import { APP_ROUTES } from '@genfeedai/constants';

export type CoreAppId = 'agent' | 'workflows' | 'studio' | 'editor';
export type CoreAppFeatureFlagKey = 'studio';

export interface CoreAppDefinition {
  description: string;
  featureFlag?: {
    isEnabledByDefault: () => boolean;
    key: CoreAppFeatureFlagKey;
  };
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
    label: 'Agent',
    shortLabel: 'Agent',
  },
  {
    description:
      'Build reusable node-based automation pipelines and manage saved workflows.',
    href: APP_ROUTES.WORKFLOWS.ROOT,
    id: 'workflows',
    label: 'Workflows',
    shortLabel: 'Flows',
  },
  {
    description:
      'Generate image and video assets quickly with a prompt bar and Replicate models.',
    featureFlag: {
      isEnabledByDefault: () => !isSaaS(),
      key: 'studio',
    },
    href: APP_ROUTES.STUDIO.ROOT,
    id: 'studio',
    label: 'Studio',
    shortLabel: 'Studio',
  },
  {
    description:
      'Compose and export media from generated assets using a Remotion-based editor.',
    href: APP_ROUTES.EDITOR.ROOT,
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

export function getCoreAppFeatureFlagFallbacks(): Record<
  CoreAppFeatureFlagKey,
  boolean
> {
  return CORE_APPS.reduce(
    (fallbacks, app) => {
      if (app.featureFlag) {
        fallbacks[app.featureFlag.key] = app.featureFlag.isEnabledByDefault();
      }

      return fallbacks;
    },
    {} as Record<CoreAppFeatureFlagKey, boolean>,
  );
}
