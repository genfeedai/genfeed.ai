import { isSaaS } from '@genfeedai/config/deployment';
import {
  APP_DISPLAY_LABELS,
  APP_RAIL_FEATURE_FLAG_KEYS,
  APP_ROUTES,
  type AppRailFeatureFlagKey,
  DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG,
  LIBRARY_CANVAS_FEATURE_FLAG,
  LOW_CREDITS_BANNER_FEATURE_FLAG,
  REPLY_BOT_FEATURE_FLAG,
} from '@genfeedai/contracts/constants';

export type CoreAppId = 'agent' | 'automation' | 'studio';
export type CoreAppFeatureFlagKey =
  | 'studio'
  | typeof REPLY_BOT_FEATURE_FLAG
  | AppRailFeatureFlagKey;

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
    description: 'Workflows, agents, and your automated content team.',
    href: APP_ROUTES.AUTOMATION.ROOT,
    id: 'automation',
    label: APP_DISPLAY_LABELS.automation,
    shortLabel: APP_DISPLAY_LABELS.automation,
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

export function getCoreAppFeatureFlagFallbacks(): Record<
  CoreAppFeatureFlagKey,
  boolean
> {
  const isAppRailEnabledByDefault = !isSaaS();
  const fallbacks = Object.fromEntries(
    APP_RAIL_FEATURE_FLAG_KEYS.map((key) => [key, isAppRailEnabledByDefault]),
  ) as Record<AppRailFeatureFlagKey, boolean>;

  return CORE_APPS.reduce(
    (fallbacks, app) => {
      if (app.featureFlag) {
        fallbacks[app.featureFlag.key] = app.featureFlag.isEnabledByDefault();
      }

      return fallbacks;
    },
    {
      ...fallbacks,
      // Capability flags stay independent from app-rail discovery flags.
      // A hidden module remains reachable by direct URL for internal testing.
      studio: true,
      // Replies fail open when PostHog is absent (Community, Desktop, SaaS
      // before flags load). PostHog can still set an explicit false.
      [REPLY_BOT_FEATURE_FLAG]: true,
    } as Record<CoreAppFeatureFlagKey, boolean>,
  );
}

/**
 * Every flag a client surface reads, subscribed from PostHog (#5468). Each key
 * with a fallback above must be here too — otherwise the fallback wins for
 * good and PostHog can never turn the surface off.
 */
export const REMOTE_FEATURE_FLAG_KEYS = [
  ...APP_RAIL_FEATURE_FLAG_KEYS,
  DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG,
  LIBRARY_CANVAS_FEATURE_FLAG,
  LOW_CREDITS_BANNER_FEATURE_FLAG,
  REPLY_BOT_FEATURE_FLAG,
  'studio',
] as const;
