import type {
  NativeAppAvailabilityInput,
  NativeAppCatalogEntry,
} from '../interfaces/ui/native-app.interface';
import type {
  NativeAppContextualEntry,
  NativeSecondaryAppId,
} from '../types/native-app';

export type { NativeAppContextualEntry, NativeSecondaryAppId };

/**
 * Apps model for the unified navigation (#5502).
 *
 * Core apps form the fixed daily loop and need no installation. Secondary
 * apps are native Genfeed apps a member installs into their own setup from
 * the Store and may pin. Installation is a presentation preference: it never
 * grants subscription, brand or release access, which the server checks on
 * every new piece of work.
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

export function isCoreAppId(value: unknown): value is CoreAppId {
  return (
    typeof value === 'string' && CORE_APP_IDS.some((appId) => appId === value)
  );
}

export const NATIVE_APP_CONTEXTUAL_ENTRIES = [
  'edit',
  'clip',
] as const satisfies readonly NativeAppContextualEntry[];

export const NATIVE_SECONDARY_APPS = {
  playground: {
    label: 'Playground',
    organizationModuleId: 'playground',
    purpose: 'Generate and iterate on images, video, avatars, music and voice.',
    contextualEntries: [],
  },
  storyboard: {
    label: 'Storyboard',
    organizationModuleId: 'storyboard',
    purpose: 'Plan sequences and shots, then assemble them.',
    contextualEntries: [],
  },
  turbo: {
    label: 'Turbo',
    organizationModuleId: 'turbo',
    purpose: 'Produce a planned quantity of content from presets or winners.',
    contextualEntries: [],
  },
  motion: {
    label: 'Motion',
    organizationModuleId: 'motion',
    purpose: 'Compose animated visuals with props, code and revisions.',
    contextualEntries: [],
  },
  clips: {
    label: 'Clips',
    organizationModuleId: 'clips',
    purpose: 'Cut highlights from long videos using their transcript.',
    contextualEntries: ['clip'],
  },
  editor: {
    label: 'Editor',
    organizationModuleId: 'editor',
    purpose: 'Finish video projects on a timeline.',
    contextualEntries: ['edit'],
  },
  automation: {
    label: 'Automation',
    organizationModuleId: 'automation',
    purpose: 'Run workflows, agents and programs on your content.',
    contextualEntries: [],
  },
  messages: {
    label: 'Messages',
    organizationModuleId: 'messages',
    purpose: 'Answer DMs, replies and comments in one inbox.',
    contextualEntries: [],
  },
  discovery: {
    label: 'Discover',
    organizationModuleId: 'discovery',
    purpose: 'Research organic timelines, tracked sources, trends and ads.',
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

/** Known installed ids in stored order, without duplicates. */
export function normalizeInstalledAppIds(
  ids: readonly unknown[] | null | undefined,
): NativeSecondaryAppId[] {
  return [...new Set((ids ?? []).filter(isNativeSecondaryAppId))];
}

/** Every app that can take a place on the rail: the core loop and secondary apps. */
export const RAIL_APP_IDS: readonly string[] = [
  ...CORE_APP_IDS,
  ...NATIVE_SECONDARY_APP_IDS,
];

export function isRailAppId(value: unknown): value is string {
  return typeof value === 'string' && RAIL_APP_IDS.includes(value);
}

/** Known rail app ids in stored order, without duplicates. */
export function normalizeRailAppOrder(
  ids: readonly unknown[] | null | undefined,
): string[] {
  return [...new Set((ids ?? []).filter(isRailAppId))];
}

/** Known core app ids in stored order, without duplicates. */
export function normalizeHiddenAppIds(
  ids: readonly unknown[] | null | undefined,
): CoreAppId[] {
  return [...new Set((ids ?? []).filter(isCoreAppId))];
}

/** The app home falls back to when nothing chosen is available. */
export const DEFAULT_HOME_APP_ID = 'workspace';

/**
 * The app a member lands on: their own choice, else the organization default,
 * else Workspace. A choice the member cannot open right now is skipped, so a
 * hidden or unreleased app never strands anyone on a missing page.
 */
export function resolveHomeAppId({
  availableAppIds,
  organizationHomeAppId,
  userHomeAppId,
}: {
  availableAppIds: readonly string[];
  organizationHomeAppId?: string | null;
  userHomeAppId?: string | null;
}): string {
  for (const candidate of [userHomeAppId, organizationHomeAppId]) {
    if (isRailAppId(candidate) && availableAppIds.includes(candidate)) {
      return candidate;
    }
  }
  return DEFAULT_HOME_APP_ID;
}

/**
 * Applies a member's rail order. Listed items come first in that order;
 * anything unlisted (a newly pinned or newly released app) follows in its
 * original order.
 */
export function applyRailAppOrder<T extends { id: string }>(
  items: readonly T[],
  order: readonly string[],
): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  const listed = items
    .filter((item) => rank.has(item.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...listed, ...items.filter((item) => !rank.has(item.id))];
}

export const NATIVE_APP_AVAILABILITY_STATES = [
  'not-installed',
  'installed',
  'pinned',
  'organization-disabled',
  'subscription-required',
  'unreleased',
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
  organizationAccess,
  pinnedAppIds,
}: NativeAppAvailabilityInput): NativeAppAvailabilityState {
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
        return 'unreleased';
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
