import { isSaaS } from '@genfeedai/config/deployment';
import {
  APP_DISPLAY_LABELS,
  APP_ROUTES,
  APP_SWITCHER_FEATURE_FLAG_KEYS,
  type AppSwitcherFeatureFlagKey,
  REPLY_BOT_FEATURE_FLAG,
} from '@genfeedai/constants';

export type CoreAppId = 'agent' | 'automate' | 'studio';
export type CoreAppFeatureFlagKey =
  | 'studio'
  | typeof REPLY_BOT_FEATURE_FLAG
  | AppSwitcherFeatureFlagKey;

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
    label: APP_DISPLAY_LABELS.agent,
    shortLabel: APP_DISPLAY_LABELS.agent,
  },
  {
    description:
      'Workflows, autopilot, skills, and your automated content team.',
    href: APP_ROUTES.AUTOMATE.ROOT,
    id: 'automate',
    label: APP_DISPLAY_LABELS.automate,
    shortLabel: APP_DISPLAY_LABELS.automate,
  },
  {
    description:
      'Generate assets, then produce storyboards, clips, batches, and timeline edits at production scale.',
    featureFlag: {
      isEnabledByDefault: () => true,
      key: 'studio',
    },
    href: APP_ROUTES.STUDIO.GENERATE,
    id: 'studio',
    label: APP_DISPLAY_LABELS.studio,
    shortLabel: APP_DISPLAY_LABELS.studio,
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
  const appSwitcherDefault = !isSaaS();
  const fallbacks = Object.fromEntries(
    APP_SWITCHER_FEATURE_FLAG_KEYS.map((key) => [key, appSwitcherDefault]),
  ) as Record<AppSwitcherFeatureFlagKey, boolean>;

  return CORE_APPS.reduce(
    (fallbacks, app) => {
      if (app.featureFlag) {
        fallbacks[app.featureFlag.key] = app.featureFlag.isEnabledByDefault();
      }

      return fallbacks;
    },
    {
      ...fallbacks,
      // Capability flags stay independent from app-switcher discovery flags.
      // A hidden module remains reachable by direct URL for internal testing.
      studio: true,
      // Replies fail open when PostHog is absent (Community, Desktop, SaaS
      // before flags load). PostHog can still set an explicit false.
      [REPLY_BOT_FEATURE_FLAG]: true,
    } as Record<CoreAppFeatureFlagKey, boolean>,
  );
}
