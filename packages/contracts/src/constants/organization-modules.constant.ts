import {
  isPlatformFlagOn,
  type PlatformFlagKey,
} from './feature-flags.constant';
import {
  isReleaseItemVisible,
  type ReleaseAudienceInput,
} from './release-items.constant';

/**
 * Modules an organization shows or hides for its members. A switch only
 * hides the module's app: the API and MCP never refuse work because of it.
 * Neither does a module's release (Admin → Flags `release_<id>`): it hides
 * the app in the web app only. New work is gated, on cloud, by the
 * subscription for paid modules. The platform kill switch
 * (`platformFlagKey`) answers every module route with 404, except
 * Playground (see `isOrganizationModuleSwitchedOff`).
 */
export const ORGANIZATION_MODULES = {
  playground: {
    label: 'Playground',
    isDefaultEnabled: true,
    requiresSubscription: false,
    platformFlagKey: 'studio',
  },
  storyboard: {
    label: 'Storyboard',
    isDefaultEnabled: true,
    requiresSubscription: false,
    platformFlagKey: 'storyboard',
  },
  publishing: {
    label: 'Publishing',
    isDefaultEnabled: true,
    requiresSubscription: false,
    platformFlagKey: 'publishing',
  },
  analytics: {
    label: 'Analytics',
    isDefaultEnabled: true,
    requiresSubscription: false,
    platformFlagKey: 'analytics',
  },
  motion: {
    label: 'Motion',
    isDefaultEnabled: false,
    requiresSubscription: false,
    platformFlagKey: 'motion',
  },
  clipper: {
    label: 'Clipper',
    isDefaultEnabled: false,
    requiresSubscription: false,
    platformFlagKey: 'clipper',
  },
  turbo: {
    label: 'Turbo',
    isDefaultEnabled: false,
    requiresSubscription: false,
    platformFlagKey: 'turbo',
  },
  editor: {
    label: 'Editor',
    isDefaultEnabled: false,
    requiresSubscription: false,
    platformFlagKey: 'editor',
  },
  automation: {
    label: 'Automation',
    isDefaultEnabled: false,
    requiresSubscription: true,
    platformFlagKey: 'automation',
  },
  messages: {
    label: 'Messages',
    isDefaultEnabled: false,
    requiresSubscription: true,
    platformFlagKey: 'messages',
  },
  discovery: {
    label: 'Discovery',
    isDefaultEnabled: true,
    requiresSubscription: true,
    platformFlagKey: 'discovery',
  },
} as const satisfies Record<
  string,
  {
    label: string;
    isDefaultEnabled: boolean;
    requiresSubscription: boolean;
    platformFlagKey: PlatformFlagKey;
  }
>;

export type OrganizationModuleId = keyof typeof ORGANIZATION_MODULES;

export const ORGANIZATION_MODULE_IDS = Object.keys(
  ORGANIZATION_MODULES,
) as OrganizationModuleId[];

export type OrganizationModuleOverrides = Partial<
  Record<OrganizationModuleId, boolean>
>;

const ORGANIZATION_MODULE_ID_SET: ReadonlySet<string> = new Set(
  ORGANIZATION_MODULE_IDS,
);

/**
 * Strict on writes: typos and non-booleans must never be stored. Returns the
 * overrides, or `null` when the value is not a map of known module IDs to
 * booleans. Hand-written rather than a zod schema because the protected shell
 * resolves module navigation from it, and zod would otherwise ship in the
 * first-load JavaScript of every app route.
 */
export function parseOrganizationModuleOverrides(
  value: unknown,
): OrganizationModuleOverrides | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const overrides: OrganizationModuleOverrides = {};
  for (const [moduleId, isShown] of Object.entries(value)) {
    if (!ORGANIZATION_MODULE_ID_SET.has(moduleId)) return null;
    if (isShown === undefined) continue;
    if (typeof isShown !== 'boolean') return null;
    overrides[moduleId as OrganizationModuleId] = isShown;
  }
  return overrides;
}

export type OrganizationModulePreferences = Readonly<
  Record<OrganizationModuleId, boolean>
>;
export interface OrganizationModulePreferenceInput
  extends ReleaseAudienceInput {
  moduleOverrides?: unknown;
  hasPaidModuleSubscription?: unknown;
}
/** Resolved platform flags: kill switches and `release_<id>` releases. */
export type OrganizationModuleFlagInput = Readonly<Record<string, unknown>>;

/** The organization's own switch, or the module default when unset. */
function isOrganizationModuleShown(
  moduleId: OrganizationModuleId,
  overrides: OrganizationModuleOverrides,
  hasOrganizationBilling: boolean,
): boolean {
  return (
    overrides[moduleId] ??
    (!hasOrganizationBilling || ORGANIZATION_MODULES[moduleId].isDefaultEnabled)
  );
}

/**
 * Whether the organization can see the module at all: its platform kill
 * switch is on and it is released to the organization. The Modules settings
 * page lists only these.
 */
export function isOrganizationModuleOffered(
  moduleId: OrganizationModuleId,
  settings: OrganizationModulePreferenceInput | null | undefined,
  flags: OrganizationModuleFlagInput,
): boolean {
  return (
    isPlatformFlagOn(flags, ORGANIZATION_MODULES[moduleId].platformFlagKey) &&
    isReleaseItemVisible(moduleId, settings, flags)
  );
}

/**
 * Whether the API refuses the module because an operator switched its
 * platform kill switch off in Admin → Flags (#8796). Playground is exempt:
 * it carries every generation endpoint, so switching Studio off only hides
 * the app and its routes and can never shut generation off by accident.
 */
export function isOrganizationModuleSwitchedOff(
  moduleId: OrganizationModuleId,
  flags: OrganizationModuleFlagInput,
): boolean {
  return (
    moduleId !== 'playground' &&
    !isPlatformFlagOn(flags, ORGANIZATION_MODULES[moduleId].platformFlagKey)
  );
}

/** Navigation only: which module apps the organization shows. */
export function resolveOrganizationModulePreferences(
  settings: OrganizationModulePreferenceInput | null | undefined,
  flags: OrganizationModuleFlagInput,
): OrganizationModulePreferences | null {
  if (typeof settings?.hasOrganizationBilling !== 'boolean') return null;
  const overrides = parseOrganizationModuleOverrides(settings.moduleOverrides);
  if (!overrides) return null;
  const hasOrganizationBilling = settings.hasOrganizationBilling;
  return Object.fromEntries(
    ORGANIZATION_MODULE_IDS.map((moduleId) => [
      moduleId,
      isReleaseItemVisible(moduleId, settings, flags) &&
        isOrganizationModuleShown(moduleId, overrides, hasOrganizationBilling),
    ]),
  ) as OrganizationModulePreferences;
}

/** What the server decides for one module operation. */
export type OrganizationModuleAdmission =
  | { isAllowed: true; reason: null }
  | {
      isAllowed: false;
      reason: 'subscription-required' | 'unavailable';
    };

/** Admission, or why the app shell hides the module. */
export type OrganizationModuleAccess =
  | OrganizationModuleAdmission
  | { isAllowed: false; reason: 'disabled' | 'unreleased' };

export interface OrganizationModuleAccessInput {
  moduleId: OrganizationModuleId;
  isSettingsLoaded: boolean;
  hasOrganizationBilling: boolean;
  hasPaidSubscription: boolean | null;
  operation: 'read' | 'export' | 'cancel' | 'write';
}

/**
 * What the app shell shows for a module: hidden by the organization
 * (`disabled`), hidden because it is not released (`unreleased`), or the
 * admission the server would decide. Release is presentation only: the
 * server admits writes to an unreleased module for API and MCP callers, and
 * ignores the organization's switch.
 */
export function resolveOrganizationModulePresentationAccess(
  settings: OrganizationModulePreferenceInput | null | undefined,
  moduleId: OrganizationModuleId,
  flags: OrganizationModuleFlagInput,
): OrganizationModuleAccess {
  if (typeof settings?.hasOrganizationBilling !== 'boolean')
    return { isAllowed: false, reason: 'unavailable' };
  const overrides = parseOrganizationModuleOverrides(settings.moduleOverrides);
  if (!overrides) return { isAllowed: false, reason: 'unavailable' };
  if (!isReleaseItemVisible(moduleId, settings, flags)) {
    return { isAllowed: false, reason: 'unreleased' };
  }
  if (
    !isOrganizationModuleShown(
      moduleId,
      overrides,
      settings.hasOrganizationBilling,
    )
  ) {
    return { isAllowed: false, reason: 'disabled' };
  }
  return resolveOrganizationModuleAccess({
    moduleId,
    operation: 'write',
    isSettingsLoaded: true,
    hasOrganizationBilling: settings.hasOrganizationBilling,
    hasPaidSubscription:
      typeof settings.hasPaidModuleSubscription === 'boolean'
        ? settings.hasPaidModuleSubscription
        : null,
  });
}

/**
 * Admission only: authorization, platform flags, the subscription for paid
 * modules and credits still apply. Neither the organization's module
 * switches nor a module's release refuse work here: they only hide the app,
 * so API and MCP callers keep working in a module the web app does not show.
 */
export function resolveOrganizationModuleAccess({
  moduleId,
  isSettingsLoaded,
  hasOrganizationBilling,
  hasPaidSubscription,
  operation,
}: OrganizationModuleAccessInput): OrganizationModuleAdmission {
  if (operation !== 'write') return { isAllowed: true, reason: null };
  if (!isSettingsLoaded) return { isAllowed: false, reason: 'unavailable' };
  if (
    hasOrganizationBilling &&
    ORGANIZATION_MODULES[moduleId].requiresSubscription
  ) {
    if (hasPaidSubscription === null)
      return { isAllowed: false, reason: 'unavailable' };
    if (!hasPaidSubscription)
      return { isAllowed: false, reason: 'subscription-required' };
  }
  return { isAllowed: true, reason: null };
}
