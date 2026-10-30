import {
  ADMIN_RAIL_CATEGORIES,
  APP_RAIL_REGISTRY,
  getActiveAppId,
} from '@ui/shell/app-rail/app-rail.registry';

/** Admin is split by category; `/admin` itself belongs to admin-overview. */
const ANALYTICS_APPS = [...APP_RAIL_REGISTRY, ...ADMIN_RAIL_CATEGORIES];

export const ANALYTICS_APP_SETTINGS = 'settings';
export const ANALYTICS_APP_OTHER = 'other';
export const ANALYTICS_APP_PUBLIC = 'public';

/** `/settings/*` (personal) or `/:org/~/settings/*` and `/:org/:brand/settings/*`. */
function isSettingsPath(pathname: string): boolean {
  const segments = pathname.split('?')[0].split('/').filter(Boolean);
  return segments[0] === 'settings' || segments[2] === 'settings';
}

/**
 * The product app that owns a pathname, as a bounded slug (`agent`, `clipper`,
 * `admin-customers`, `settings`, …). Uses the same path roots as the app rail,
 * so "most used app" in PostHog and Sentry matches what the rail highlights.
 */
export function resolveAnalyticsApp(pathname: string): string {
  const appId = getActiveAppId(ANALYTICS_APPS, pathname);
  if (appId) {
    return appId;
  }

  return isSettingsPath(pathname)
    ? ANALYTICS_APP_SETTINGS
    : ANALYTICS_APP_OTHER;
}
