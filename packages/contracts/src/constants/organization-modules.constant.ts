import { z } from 'zod';

/** Organization preferences are distinct from platform operator kill switches. */
export const ORGANIZATION_MODULES = {
  playground: {
    label: 'Playground',
    isDefaultEnabled: true,
    requiresSubscription: false,
    isToggleable: false,
  },
  storyboard: {
    label: 'Storyboard',
    isDefaultEnabled: true,
    requiresSubscription: false,
    isToggleable: false,
  },
  publishing: {
    label: 'Publishing',
    isDefaultEnabled: true,
    requiresSubscription: false,
    isToggleable: true,
  },
  analytics: {
    label: 'Analytics',
    isDefaultEnabled: true,
    requiresSubscription: false,
    isToggleable: true,
  },
  motion: {
    label: 'Motion',
    isDefaultEnabled: false,
    requiresSubscription: false,
    isToggleable: true,
  },
  clips: {
    label: 'Clips',
    isDefaultEnabled: false,
    requiresSubscription: false,
    isToggleable: true,
  },
  batch: {
    label: 'Batch',
    isDefaultEnabled: false,
    requiresSubscription: false,
    isToggleable: true,
  },
  editor: {
    label: 'Editor',
    isDefaultEnabled: false,
    requiresSubscription: false,
    isToggleable: true,
  },
  automation: {
    label: 'Automation',
    isDefaultEnabled: false,
    requiresSubscription: true,
    isToggleable: true,
  },
  messages: {
    label: 'Messages',
    isDefaultEnabled: false,
    requiresSubscription: true,
    isToggleable: true,
  },
  discovery: {
    label: 'Discovery',
    isDefaultEnabled: true,
    requiresSubscription: true,
    isToggleable: true,
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
      reason: 'disabled' | 'subscription-required' | 'unavailable';
    };

export interface OrganizationModuleAccessInput {
  moduleId: OrganizationModuleId;
  moduleOverrides: unknown;
  isSettingsLoaded: boolean;
  hasOrganizationBilling: boolean;
  hasPaidSubscription: boolean | null;
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
  });
}

/** Admission only: authorization, platform flags and credits still apply. */
export function resolveOrganizationModuleAccess({
  moduleId,
  moduleOverrides,
  isSettingsLoaded,
  hasOrganizationBilling,
  hasPaidSubscription,
  operation,
}: OrganizationModuleAccessInput): OrganizationModuleAccess {
  if (operation !== 'write') return { isAllowed: true, reason: null };
  if (!isSettingsLoaded) return { isAllowed: false, reason: 'unavailable' };
  const parsed = organizationModuleOverridesSchema.safeParse(moduleOverrides);
  if (!parsed.success) return { isAllowed: false, reason: 'unavailable' };
  const module = ORGANIZATION_MODULES[moduleId];
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
