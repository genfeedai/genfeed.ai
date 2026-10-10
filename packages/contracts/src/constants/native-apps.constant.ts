import type {
  NativeAppAvailabilityInput,
  NativeAppCatalogEntry,
} from '../interfaces/ui/native-app.interface';
import type {
  NativeAppContextualEntry,
  NativeAppReleaseEligibility,
  NativeSecondaryAppId,
} from '../types/native-app';

export type {
  NativeAppContextualEntry,
  NativeAppReleaseEligibility,
  NativeSecondaryAppId,
};

/**
 * Apps model for the unified navigation (#5502).
 *
 * Core apps form the fixed daily loop and need no installation. Secondary
 * apps are native Genfeed apps a member installs into their own setup from
 * the Store and may pin. Installation is a presentation preference: it never
 * grants organization, subscription, brand or release access, which the
 * server checks on every new piece of work.
 *
 * Ids reuse the existing rail and organization module ids so routes and
 * stored data keep their meaning; labels are the one-word visible names.
 */
export const CORE_APP_IDS = [
  'workspace',
  'agent',
  'library',
  'publishing',
  'analytics',
] as const;

export type CoreAppId = (typeof CORE_APP_IDS)[number];

export const NATIVE_APP_RELEASE_ELIGIBILITIES = [
  'released',
  'founder-only',
] as const satisfies readonly NativeAppReleaseEligibility[];

export const NATIVE_APP_CONTEXTUAL_ENTRIES = [
  'edit',
  'clip',
] as const satisfies readonly NativeAppContextualEntry[];

export const NATIVE_SECONDARY_APPS = {
  playground: {
    label: 'Playground',
    organizationModuleId: 'playground',
    purpose: 'Generate and iterate on images, video, avatars, music and voice.',
    releaseEligibility: 'released',
    contextualEntries: [],
  },
  storyboard: {
    label: 'Storyboard',
    organizationModuleId: 'storyboard',
    purpose: 'Plan sequences and shots, then assemble them.',
    releaseEligibility: 'released',
    contextualEntries: [],
  },
  // The Batch module backs Turbo until #5936 renames it.
  turbo: {
    label: 'Turbo',
    organizationModuleId: 'batch',
    purpose: 'Produce a planned quantity of content from presets or winners.',
    releaseEligibility: 'released',
    contextualEntries: [],
  },
  motion: {
    label: 'Motion',
    organizationModuleId: 'motion',
    purpose: 'Compose animated visuals with props, code and revisions.',
    releaseEligibility: 'founder-only',
    contextualEntries: [],
  },
  clips: {
    label: 'Clips',
    organizationModuleId: 'clips',
    purpose: 'Cut highlights from long videos using their transcript.',
    releaseEligibility: 'founder-only',
    contextualEntries: ['clip'],
  },
  editor: {
    label: 'Editor',
    organizationModuleId: 'editor',
    purpose: 'Finish video projects on a timeline.',
    releaseEligibility: 'founder-only',
    contextualEntries: ['edit'],
  },
  automation: {
    label: 'Automation',
    organizationModuleId: 'automation',
    purpose: 'Run workflows, agents and programs on your content.',
    releaseEligibility: 'founder-only',
    contextualEntries: [],
  },
  messages: {
    label: 'Messages',
    organizationModuleId: 'messages',
    purpose: 'Answer DMs, replies and comments in one inbox.',
    releaseEligibility: 'founder-only',
    contextualEntries: [],
  },
  discovery: {
    label: 'Discover',
    organizationModuleId: 'discovery',
    purpose: 'Research organic timelines, tracked sources, trends and ads.',
    releaseEligibility: 'released',
    contextualEntries: [],
  },
} as const satisfies Record<NativeSecondaryAppId, NativeAppCatalogEntry>;

export const NATIVE_SECONDARY_APP_IDS = Object.keys(
  NATIVE_SECONDARY_APPS,
) as NativeSecondaryAppId[];

export function isNativeSecondaryAppId(
  value: unknown,
): value is NativeSecondaryAppId {
  return (
    typeof value === 'string' &&
    NATIVE_SECONDARY_APP_IDS.some((appId) => appId === value)
  );
}

export function isFounderOnlyNativeApp(appId: NativeSecondaryAppId): boolean {
  return NATIVE_SECONDARY_APPS[appId].releaseEligibility === 'founder-only';
}

/**
 * Store v1 catalog for the caller. Founder-only experiments stay out of the
 * customer catalog; released apps are listed whatever their access state, so
 * the Store can show a truthful locked state.
 */
export function listStoreNativeAppIds(
  isFounderOperator: boolean,
): NativeSecondaryAppId[] {
  return NATIVE_SECONDARY_APP_IDS.filter(
    (appId) => isFounderOperator || !isFounderOnlyNativeApp(appId),
  );
}

/** Known installed ids in stored order, without duplicates. */
export function normalizeInstalledAppIds(
  ids: readonly unknown[] | null | undefined,
): NativeSecondaryAppId[] {
  return [...new Set((ids ?? []).filter(isNativeSecondaryAppId))];
}

export const NATIVE_APP_AVAILABILITY_STATES = [
  'not-installed',
  'installed',
  'pinned',
  'organization-disabled',
  'subscription-required',
  'founder-only',
  'unavailable',
] as const;

export type NativeAppAvailabilityState =
  (typeof NATIVE_APP_AVAILABILITY_STATES)[number];

/**
 * Presentation state of a secondary app for the current member. Access
 * denials win over personal preferences, and unresolved access is reported as
 * unavailable rather than available. The server rechecks every new piece of
 * work; this state never admits one.
 */
export function resolveNativeAppAvailability({
  appId,
  installedAppIds,
  isFounderOperator,
  organizationAccess,
  pinnedAppIds,
}: NativeAppAvailabilityInput): NativeAppAvailabilityState {
  if (isFounderOnlyNativeApp(appId) && !isFounderOperator) {
    return 'founder-only';
  }
  if (!organizationAccess) {
    return 'unavailable';
  }
  if (!organizationAccess.isAllowed) {
    switch (organizationAccess.reason) {
      case 'disabled':
        return 'organization-disabled';
      case 'subscription-required':
        return 'subscription-required';
      case 'unreleased':
        return 'founder-only';
      default:
        return 'unavailable';
    }
  }
  if (!installedAppIds.includes(appId)) {
    return 'not-installed';
  }
  return pinnedAppIds.includes(appId) ? 'pinned' : 'installed';
}

/** Whether the app can be opened for new work from the launcher. */
export function isNativeAppLaunchable(
  state: NativeAppAvailabilityState,
): boolean {
  return state === 'installed' || state === 'pinned';
}

/**
 * The Store exposes the workflow library only while Automation is personally
 * installed and eligible for new work. Saved workflows stay readable through
 * their own authorized routes either way.
 */
export function isWorkflowLibraryVisible(
  automationState: NativeAppAvailabilityState,
): boolean {
  return isNativeAppLaunchable(automationState);
}
