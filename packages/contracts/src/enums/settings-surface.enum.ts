/**
 * Which settings surface the operator is on. Derived from the route:
 * `/settings` → personal, `/:org/~/settings` → organization,
 * `/:org/:brand/settings` → brand.
 *
 * This is UI/route language, not a persisted Prisma column — lowercase
 * product values are correct (`enum_source_of_truth.md` rule 3).
 *
 * Distinct from `@genfeedai/contracts/constants` `SettingsScope` (`organization` |
 * `brand` | `agent`), which names who owns a settings *field*.
 */
export enum SettingsSurface {
  PERSONAL = 'personal',
  ORGANIZATION = 'organization',
  BRAND = 'brand',
}

export const SETTINGS_SURFACE_LABELS: Record<SettingsSurface, string> = {
  [SettingsSurface.BRAND]: 'Brand',
  [SettingsSurface.ORGANIZATION]: 'Organization',
  [SettingsSurface.PERSONAL]: 'Personal',
};
