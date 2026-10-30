import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  type AppRailPathRoots,
  getActiveAppId,
} from '@ui/shell/app-rail/app-rail.active-app';

/**
 * Path roots per app, mirroring the app rail registry. The registry carries
 * icons, and this runs from the root layout on every route, so it must not
 * import the registry; `analytics-app.test.ts` fails if the two drift apart.
 */
export const ANALYTICS_APP_PATH_ROOTS: readonly AppRailPathRoots[] = [
  { activePathRoots: ['/workspace', '/overview'], id: 'workspace' },
  { activePathRoots: ['/agent'], id: 'agent' },
  { activePathRoots: ['/library'], id: 'library' },
  { activePathRoots: ['/publishing'], id: 'publishing' },
  { activePathRoots: ['/analytics'], id: 'analytics' },
  { activePathRoots: [APP_ROUTES.STUDIO.PLAYGROUND], id: 'playground' },
  { activePathRoots: [APP_ROUTES.STUDIO.STORYBOARD], id: 'storyboard' },
  { activePathRoots: [APP_ROUTES.STUDIO.TURBO], id: 'turbo' },
  { activePathRoots: [APP_ROUTES.STUDIO.MOTION], id: 'motion' },
  { activePathRoots: [APP_ROUTES.STUDIO.CLIPPER], id: 'clipper' },
  { activePathRoots: [APP_ROUTES.STUDIO.EDITOR], id: 'editor' },
  { activePathRoots: ['/automation'], id: 'automation' },
  { activePathRoots: ['/messages'], id: 'messages' },
  { activePathRoots: ['/discovery'], id: 'discovery' },
  {
    activePathRoots: [APP_ROUTES.ADMIN.ROOT, '/admin/overview'],
    id: 'admin-overview',
  },
  {
    activePathRoots: [
      APP_ROUTES.ADMIN.ORGANIZATIONS,
      APP_ROUTES.ADMIN.BRANDS,
      APP_ROUTES.ADMIN.ADMINISTRATION.USERS,
      APP_ROUTES.ADMIN.ADMINISTRATION.CONCIERGE_ACCOUNTS,
      APP_ROUTES.ADMIN.ADMINISTRATION.SUBSCRIPTIONS,
      APP_ROUTES.ADMIN.ADMINISTRATION.REFERRALS,
    ],
    id: 'admin-customers',
  },
  {
    activePathRoots: [
      '/admin/content',
      '/admin/configuration',
      APP_ROUTES.ADMIN.FOLDERS,
      APP_ROUTES.ADMIN.LIBRARY.VOICES,
    ],
    id: 'admin-content',
  },
  {
    activePathRoots: [
      '/admin/automation',
      APP_ROUTES.ADMIN.ADMINISTRATION.LEARNING,
    ],
    id: 'admin-automation',
  },
  { activePathRoots: ['/admin/economics'], id: 'admin-economics' },
  {
    activePathRoots: [
      APP_ROUTES.ADMIN.SETTINGS.ROOT,
      APP_ROUTES.ADMIN.FLAGS,
      APP_ROUTES.ADMIN.ADMINISTRATION.ROLES,
      APP_ROUTES.ADMIN.ADMINISTRATION.ANNOUNCEMENTS,
      APP_ROUTES.ADMIN.ADMINISTRATION.SYSTEM_EMAILS,
    ],
    id: 'admin-platform',
  },
];

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
  const appId = getActiveAppId(ANALYTICS_APP_PATH_ROOTS, pathname);
  if (appId) {
    return appId;
  }

  return isSettingsPath(pathname)
    ? ANALYTICS_APP_SETTINGS
    : ANALYTICS_APP_OTHER;
}
