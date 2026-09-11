import { SettingsSurface } from '@genfeedai/contracts';

export interface SettingsScopeRouteParams {
  brandSlug?: string;
  orgSlug?: string;
}

/**
 * Derives which settings surface a route belongs to — brand route → brand
 * pages, org route → org pages, otherwise personal pages. Scope MUST come
 * from route params, never from selected-brand/org session context (that
 * context backfills `useOrgUrl` for navigation, which would make a flat
 * personal route like `/settings/personal` look brand-scoped whenever a
 * brand happens to be selected in session).
 *
 * Shared by `useAppProtectedLayout` (sidebar menu + switcher visibility) and
 * `AppProtectedTopbar` (brand switcher visibility) so both surfaces agree on
 * scope for the same route.
 */
export function resolveSettingsScope(
  routeParams: SettingsScopeRouteParams,
): SettingsSurface {
  if (routeParams.brandSlug) {
    return SettingsSurface.BRAND;
  }
  if (routeParams.orgSlug) {
    return SettingsSurface.ORGANIZATION;
  }
  return SettingsSurface.PERSONAL;
}
