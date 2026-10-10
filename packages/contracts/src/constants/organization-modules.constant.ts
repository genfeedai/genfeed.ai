import { z } from 'zod';

/**
 * Organization preferences are distinct from platform operator kill switches.
 * Founder-only modules (#5502) are unreleased on cloud: they admit new work
 * only in organizations a platform admin put on release preview.
 */
export const ORGANIZATION_MODULES = {
  playground: {
    label: 'Playground',
    isDefaultEnabled: true,
    requiresSubscription: false,
    isToggleable: false,
    isFounderOnly: false,
  },
  storyboard: {
    label: 'Storyboard',
    isDefaultEnabled: true,
    requiresSubscription: false,
    isToggleable: false,
    isFounderOnly: false,
  },
  publishing: {
    label: 'Publishing',
    isDefaultEnabled: true,
    requiresSubscription: false,
    isToggleable: true,
    isFounderOnly: false,
  },
  analytics: {
    label: 'Analytics',
    isDefaultEnabled: true,
    requiresSubscription: false,
    isToggleable: true,
    isFounderOnly: false,
  },
  motion: {
    label: 'Motion',
    isDefaultEnabled: false,
    requiresSubscription: false,
    isToggleable: true,
    isFounderOnly: true,
  },
  clips: {
    label: 'Clips',
    isDefaultEnabled: false,
    requiresSubscription: false,
    isToggleable: true,
    isFounderOnly: true,
  },
  batch: {
    label: 'Batch',
    isDefaultEnabled: false,
    requiresSubscription: false,
    isToggleable: true,
    isFounderOnly: false,
  },
  editor: {
    label: 'Editor',
    isDefaultEnabled: false,
    requiresSubscription: false,
    isToggleable: true,
    isFounderOnly: true,
  },
  automation: {
    label: 'Automation',
    isDefaultEnabled: false,
    requiresSubscription: true,
    isToggleable: true,
    isFounderOnly: true,
  },
  messages: {
    label: 'Messages',
    isDefaultEnabled: false,
    requiresSubscription: true,
    isToggleable: true,
    isFounderOnly: true,
  },
  discovery: {
    label: 'Discovery',
    isDefaultEnabled: true,
    requiresSubscription: true,
    isToggleable: true,
    isFounderOnly: false,
  },
} as const;

export type OrganizationModuleId = keyof typeof ORGANIZATION_MODULES;
export type CreditBasedOrganizationModuleId = {
  [TModule in OrganizationModuleId]: (typeof ORGANIZATION_MODULES)[TModule]['requiresSubscription'] extends false
    ? TModule
    : never;
}[OrganizationModuleId];
export type ToggleableOrganizationModuleId = {
  [TModule in OrganizationModuleId]: (typeof ORGANIZATION_MODULES)[TModule]['isToggleable'] extends true
    ? TModule
    : never;
}[OrganizationModuleId];

export const ORGANIZATION_MODULE_IDS = Object.keys(
  ORGANIZATION_MODULES,
) as OrganizationModuleId[];

// Strict on writes and admission: typos and non-booleans must never grant access.
export const organizationModuleOverridesSchema = z.strictObject({
  publishing: z.boolean().optional(),
  analytics: z.boolean().optional(),
  motion: z.boolean().optional(),
  clips: z.boolean().optional(),
  batch: z.boolean().optional(),
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
export interface OrganizationModulePreferenceInput {
  moduleOverrides?: unknown;
  hasOrganizationBilling?: unknown;
  hasPaidModuleSubscription?: unknown;
  isReleasePreviewEnabled?: unknown;
}

/** On cloud, a founder-only module is unreleased outside release preview. */
export function isOrganizationModuleUnreleased(
  moduleId: OrganizationModuleId,
  hasOrganizationBilling: boolean,
  isReleasePreviewEnabled: boolean,
): boolean {
  return (
    hasOrganizationBilling &&
    ORGANIZATION_MODULES[moduleId].isFounderOnly &&
    !isReleasePreviewEnabled
  );
}

export interface UnreleasedModuleChangeInput {
  hasOrganizationBilling: boolean;
  isReleasePreviewEnabled: boolean;
  /** Stored overrides; an unreadable value counts as nothing switched on. */
  previousOverrides: unknown;
  nextOverrides: Partial<Record<OrganizationModuleId, boolean>> | undefined;
}

/**
 * #5502 modules a settings update would switch from off to on while they are
 * unreleased for the organization. Values already stored are not reported, so
 * other module changes still save; admission refuses unreleased work anyway.
 */
export function findNewlyEnabledUnreleasedModules({
  hasOrganizationBilling,
  isReleasePreviewEnabled,
  nextOverrides,
  previousOverrides,
}: UnreleasedModuleChangeInput): OrganizationModuleId[] {
  if (!nextOverrides) return [];
  const parsed = organizationModuleOverridesSchema.safeParse(
    previousOverrides ?? {},
  );
  const previous: Partial<Record<OrganizationModuleId, boolean>> =
    parsed.success ? parsed.data : {};
  return ORGANIZATION_MODULE_IDS.filter(
    (moduleId) =>
      nextOverrides[moduleId] === true &&
      previous[moduleId] !== true &&
      isOrganizationModuleUnreleased(
        moduleId,
        hasOrganizationBilling,
        isReleasePreviewEnabled,
      ),
  );
}

/** Navigation/preferences only. Enabled subscription modules still require fresh admission. */
export function resolveOrganizationModulePreferences(
  settings: OrganizationModulePreferenceInput | null | undefined,
): OrganizationModulePreferences | null {
  if (typeof settings?.hasOrganizationBilling !== 'boolean') return null;
  const parsed = organizationModuleOverridesSchema.safeParse(
    settings.moduleOverrides,
  );
  if (!parsed.success) return null;
  return Object.fromEntries(
    ORGANIZATION_MODULE_IDS.map((moduleId) => {
      const module = ORGANIZATION_MODULES[moduleId];
      if (
        isOrganizationModuleUnreleased(
          moduleId,
          settings.hasOrganizationBilling === true,
          settings.isReleasePreviewEnabled === true,
        )
      ) {
        return [moduleId, false];
      }
      return [
        moduleId,
        !module.isToggleable ||
          (parsed.data[moduleId as ToggleableOrganizationModuleId] ??
            (!settings.hasOrganizationBilling || module.isDefaultEnabled)),
      ];
    }),
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
  moduleOverrides: unknown;
  isSettingsLoaded: boolean;
  hasOrganizationBilling: boolean;
  hasPaidSubscription: boolean | null;
  /** Platform-admin release preview; unlocks founder-only modules on cloud. */
  isReleasePreviewEnabled: boolean;
  operation: 'read' | 'export' | 'cancel' | 'write';
}

/** Creation presentation only. The server still rechecks every actual write. */
export function resolveOrganizationModulePresentationAccess(
  settings: OrganizationModulePreferenceInput | null | undefined,
  moduleId: OrganizationModuleId,
): OrganizationModuleAccess {
  if (typeof settings?.hasOrganizationBilling !== 'boolean')
    return { isAllowed: false, reason: 'unavailable' };
  return resolveOrganizationModuleAccess({
    moduleId,
    operation: 'write',
    isSettingsLoaded: true,
    moduleOverrides: settings.moduleOverrides,
    hasOrganizationBilling: settings.hasOrganizationBilling,
    hasPaidSubscription:
      typeof settings.hasPaidModuleSubscription === 'boolean'
        ? settings.hasPaidModuleSubscription
        : null,
    isReleasePreviewEnabled: settings.isReleasePreviewEnabled === true,
  });
}

/** Admission only: authorization, platform flags and credits still apply. */
export function resolveOrganizationModuleAccess({
  moduleId,
  moduleOverrides,
  isSettingsLoaded,
  hasOrganizationBilling,
  hasPaidSubscription,
  isReleasePreviewEnabled,
  operation,
}: OrganizationModuleAccessInput): OrganizationModuleAccess {
  if (operation !== 'write') return { isAllowed: true, reason: null };
  if (!isSettingsLoaded) return { isAllowed: false, reason: 'unavailable' };
  const parsed = organizationModuleOverridesSchema.safeParse(moduleOverrides);
  if (!parsed.success) return { isAllowed: false, reason: 'unavailable' };
  const module = ORGANIZATION_MODULES[moduleId];
  if (
    isOrganizationModuleUnreleased(
      moduleId,
      hasOrganizationBilling,
      isReleasePreviewEnabled,
    )
  ) {
    return { isAllowed: false, reason: 'unreleased' };
  }
  const isEnabled = module.isToggleable
    ? (parsed.data[moduleId as ToggleableOrganizationModuleId] ??
      (!hasOrganizationBilling || module.isDefaultEnabled))
    : true;
  if (!isEnabled) return { isAllowed: false, reason: 'disabled' };
  if (hasOrganizationBilling && module.requiresSubscription) {
    if (hasPaidSubscription === null)
      return { isAllowed: false, reason: 'unavailable' };
    if (!hasPaidSubscription)
      return { isAllowed: false, reason: 'subscription-required' };
  }
  return { isAllowed: true, reason: null };
}
