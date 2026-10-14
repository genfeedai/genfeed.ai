import { z } from 'zod';
import type { PlatformFlagKey } from './feature-flags.constant';
import {
  isReleaseItemVisible,
  type ReleaseAudienceInput,
} from './release-items.constant';

/**
 * Modules an organization shows or hides for its members. A switch only
 * hides the module's app: the API and MCP never refuse work because of it.
 * New work is gated by the module's release (Admin → Flags `release_<id>`),
 * its platform kill switch (`platformFlagKey`) and, on cloud, the
 * subscription for paid modules.
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
    platformFlagKey: 'studio_storyboard',
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
    platformFlagKey: 'studio_motion',
  },
  clips: {
    label: 'Clips',
    isDefaultEnabled: false,
    requiresSubscription: false,
    platformFlagKey: 'studio_clips',
  },
  turbo: {
    label: 'Turbo',
    isDefaultEnabled: false,
    requiresSubscription: false,
    platformFlagKey: 'studio_turbo',
  },
  editor: {
    label: 'Editor',
    isDefaultEnabled: false,
    requiresSubscription: false,
    platformFlagKey: 'studio_editor',
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

// Strict on writes: typos and non-booleans must never be stored.
export const organizationModuleOverridesSchema = z.strictObject({
  playground: z.boolean().optional(),
  storyboard: z.boolean().optional(),
  publishing: z.boolean().optional(),
  analytics: z.boolean().optional(),
  motion: z.boolean().optional(),
  clips: z.boolean().optional(),
  turbo: z.boolean().optional(),
  editor: z.boolean().optional(),
  automation: z.boolean().optional(),
  messages: z.boolean().optional(),
  discovery: z.boolean().optional(),
});

export type OrganizationModuleOverrides = z.infer<
  typeof organizationModuleOverridesSchema
>;
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
    flags[ORGANIZATION_MODULES[moduleId].platformFlagKey] !== false &&
    isReleaseItemVisible(moduleId, settings, flags)
  );
}

/** Navigation only: which module apps the organization shows. */
export function resolveOrganizationModulePreferences(
  settings: OrganizationModulePreferenceInput | null | undefined,
  flags: OrganizationModuleFlagInput,
): OrganizationModulePreferences | null {
  if (typeof settings?.hasOrganizationBilling !== 'boolean') return null;
  const parsed = organizationModuleOverridesSchema.safeParse(
    settings.moduleOverrides,
  );
  if (!parsed.success) return null;
  const hasOrganizationBilling = settings.hasOrganizationBilling;
  return Object.fromEntries(
    ORGANIZATION_MODULE_IDS.map((moduleId) => [
      moduleId,
      isReleaseItemVisible(moduleId, settings, flags) &&
        isOrganizationModuleShown(
          moduleId,
          parsed.data,
          hasOrganizationBilling,
        ),
    ]),
  ) as OrganizationModulePreferences;
}

export type OrganizationModuleAccess =
  | { isAllowed: true; reason: null }
  | {
      isAllowed: false;
      reason:
        | 'disabled'
        | 'subscription-required'
        | 'unreleased'
        | 'unavailable';
    };

export interface OrganizationModuleAccessInput {
  moduleId: OrganizationModuleId;
  isSettingsLoaded: boolean;
  hasOrganizationBilling: boolean;
  hasPaidSubscription: boolean | null;
  /** From `isReleaseItemVisible` for this organization. */
  isReleased: boolean;
  operation: 'read' | 'export' | 'cancel' | 'write';
}

/**
 * What the app shell shows for a module: hidden by the organization
 * (`disabled`), or the admission the server would decide. The server still
 * rechecks every write and ignores the organization's switch.
 */
export function resolveOrganizationModulePresentationAccess(
  settings: OrganizationModulePreferenceInput | null | undefined,
  moduleId: OrganizationModuleId,
  flags: OrganizationModuleFlagInput,
): OrganizationModuleAccess {
  if (typeof settings?.hasOrganizationBilling !== 'boolean')
    return { isAllowed: false, reason: 'unavailable' };
  const parsed = organizationModuleOverridesSchema.safeParse(
    settings.moduleOverrides,
  );
  if (!parsed.success) return { isAllowed: false, reason: 'unavailable' };
  const isReleased = isReleaseItemVisible(moduleId, settings, flags);
  if (
    isReleased &&
    !isOrganizationModuleShown(
      moduleId,
      parsed.data,
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
    isReleased,
  });
}

/**
 * Admission only: authorization, platform flags and credits still apply.
 * The organization's module switches only hide apps, so they never refuse
 * work here; API and MCP callers keep working with a module's app hidden.
 */
export function resolveOrganizationModuleAccess({
  moduleId,
  isSettingsLoaded,
  hasOrganizationBilling,
  hasPaidSubscription,
  isReleased,
  operation,
}: OrganizationModuleAccessInput): OrganizationModuleAccess {
  if (operation !== 'write') return { isAllowed: true, reason: null };
  if (!isSettingsLoaded) return { isAllowed: false, reason: 'unavailable' };
  if (!isReleased) return { isAllowed: false, reason: 'unreleased' };
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
