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
 * This is the SIDEBAR MENU scope, not switcher visibility: an org-scoped
 * personal page (`/:org/~/settings/personal`) has an `orgSlug`, so it
 * resolves to ORGANIZATION here and correctly renders the organization menu
 * (General/Members/Brands/…) around the personal content pane — that's the
 * whole point of the org-scoped copy. Use `isPersonalSettingsPage` below for
 * "is this specific page a personal-account page", which switcher visibility
 * needs instead.
 *
 * Shared by `useAppProtectedLayout` (sidebar menu selection) and
 * `AppProtectedTopbar` so both surfaces agree on scope for the same route.
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

/** The personal/account settings sub-pages: `/settings/<segment>`. */
const PERSONAL_SETTINGS_SEGMENTS = new Set<string>([
  'personal',
  'notifications',
  'progress',
  'help',
  'about',
]);

/**
 * Personal-account settings pages — reachable both flat (`/settings/personal`)
 * and as an org-scoped copy (`/:org/~/settings/personal`) that keeps the org
 * chrome around the account content pane. Neither switcher has an org/brand
 * to switch from on these pages, regardless of which copy is open.
 *
 * Deliberately does NOT reuse `resolveSettingsScope` or route-param-derived
 * scope: that scope is ORGANIZATION for the org-scoped copy on purpose (it
 * drives which sidebar MENU renders — General/Members/Brands/… around the
 * personal content pane), so reusing it here would wrongly keep the org
 * switcher visible on those pages (#4659 review).
 *
 * Also deliberately does NOT run through `normalizeProtectedPathname`: that
 * helper strips the org/brand prefix entirely, which collapses the org
 * settings home (`/:org/~/settings`, no sub-page — redirects to General) and
 * the brand settings home (`/:org/:brand/settings` — the brand's own
 * "Profile" page, since `BRAND_SETTINGS.PROFILE` reuses `SETTINGS.ROOT`) down
 * to the exact same normalized string as the flat personal home
 * (`/settings`). Matching on the RAW path's prefix keeps those distinguishable.
 */
export function isPersonalSettingsPage(
  pathname: string | null | undefined,
): boolean {
  if (!pathname) {
    return false;
  }

  const parts = pathname.split('/').filter(Boolean);

  // Flat: /settings (redirects to personal), /settings/personal, /settings/help, …
  if (parts[0] === 'settings') {
    return parts.length === 1 || PERSONAL_SETTINGS_SEGMENTS.has(parts[1] ?? '');
  }

  // Org-scoped copy: /:org/~/settings/personal|notifications|progress|help.
  // Bare /:org/~/settings (no 4th segment) is the org's own General page,
  // not a personal-page copy.
  if (parts[1] === '~' && parts[2] === 'settings') {
    return PERSONAL_SETTINGS_SEGMENTS.has(parts[3] ?? '');
  }

  // Brand-scoped (/:org/:brand/settings…) is never a personal-account page.
  return false;
}
