import {
  APP_RAIL_FEATURE_FLAGS,
  APP_ROUTES,
  type AppRailFeatureFlagKey,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import type {
  AppRailItemConfig,
  AppRailScope,
  AppRailScopedRouteOptions,
} from '@genfeedai/contracts/interfaces/ui/app-rail.interface';
import {
  Calendar,
  ChartNoAxesColumn,
  Clapperboard,
  Film,
  Home,
  Images,
  Layers,
  MessageSquare,
  Scissors,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  Wand2,
  Workflow,
} from 'lucide-react';

function createScopedAppRoute({
  brandPath,
  organizationPath = brandPath,
}: AppRailScopedRouteOptions): AppRailItemConfig['route'] {
  return (org, brand) =>
    brand
      ? createBrandAppRoute(org, brand, brandPath)
      : createOrganizationAppRoute(org, organizationPath);
}

/**
 * The daily loop is fixed on the rail: workspace, agent, library, publishing,
 * analytics. Every other native app opens directly from the Apps launcher
 * once the member installs it, and can be pinned below the loop (#5502).
 * Studio tools are separate apps; there is no Studio parent.
 */
export const APP_RAIL_REGISTRY: readonly AppRailItemConfig[] = [
  {
    activePathRoots: ['/workspace', '/overview'],
    description: 'workspace.description',
    icon: Home,
    group: 'daily',
    id: 'workspace',
    label: 'workspace.label',
    route: createScopedAppRoute({ brandPath: '/workspace/overview' }),
  },
  {
    activePathRoots: ['/agent'],
    description: 'agent.description',
    icon: Terminal,
    group: 'daily',
    id: 'agent',
    label: 'agent.label',
    route: createScopedAppRoute({ brandPath: '/agent' }),
    isBrandAware: true,
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.agent,
  },
  {
    activePathRoots: ['/library'],
    description: 'library.description',
    icon: Images,
    group: 'daily',
    id: 'library',
    label: 'library.label',
    route: createScopedAppRoute({ brandPath: '/library/assets' }),
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.library,
  },
  {
    activePathRoots: ['/publishing'],
    description: 'publishing.description',
    icon: Calendar,
    group: 'daily',
    id: 'publishing',
    organizationModule: 'publishing',
    label: 'publishing.label',
    route: createScopedAppRoute({ brandPath: '/publishing/overview' }),
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.publishing,
  },
  {
    activePathRoots: ['/analytics'],
    description: 'analytics.description',
    icon: ChartNoAxesColumn,
    group: 'daily',
    id: 'analytics',
    organizationModule: 'analytics',
    label: 'analytics.label',
    route: createScopedAppRoute({ brandPath: '/analytics/overview' }),
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.analytics,
  },
  // Studio apps need a brand. Their org routes pick the member's last-used
  // brand, or hand one-off generation to Agent when there is none.
  {
    activePathRoots: [APP_ROUTES.STUDIO.PLAYGROUND],
    description: 'playground.description',
    icon: Wand2,
    group: 'app',
    id: 'playground',
    isBrandAware: true,
    label: 'playground.label',
    organizationModule: 'playground',
    route: createScopedAppRoute({ brandPath: APP_ROUTES.STUDIO.PLAYGROUND }),
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.studio,
  },
  {
    activePathRoots: [APP_ROUTES.STUDIO.STORYBOARD],
    description: 'storyboard.description',
    icon: Clapperboard,
    group: 'app',
    id: 'storyboard',
    isBrandAware: true,
    label: 'storyboard.label',
    organizationModule: 'storyboard',
    route: createScopedAppRoute({ brandPath: APP_ROUTES.STUDIO.STORYBOARD }),
    surfaceFlagKey: 'studio_storyboard',
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.studio,
  },
  {
    // Turbo runs on the Batch surface until #5936 renames it.
    activePathRoots: [APP_ROUTES.STUDIO.BATCH],
    description: 'turbo.description',
    icon: Layers,
    group: 'app',
    id: 'turbo',
    isBrandAware: true,
    label: 'turbo.label',
    organizationModule: 'batch',
    route: createScopedAppRoute({ brandPath: APP_ROUTES.STUDIO.BATCH }),
    surfaceFlagKey: 'studio_batch',
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.studio,
  },
  {
    activePathRoots: [APP_ROUTES.STUDIO.MOTION],
    description: 'motion.description',
    icon: Sparkles,
    group: 'app',
    id: 'motion',
    isBrandAware: true,
    label: 'motion.label',
    organizationModule: 'motion',
    route: createScopedAppRoute({ brandPath: APP_ROUTES.STUDIO.MOTION }),
    surfaceFlagKey: 'studio_motion',
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.studio,
  },
  {
    activePathRoots: [APP_ROUTES.STUDIO.CLIPS],
    description: 'clips.description',
    icon: Scissors,
    group: 'app',
    id: 'clips',
    isBrandAware: true,
    label: 'clips.label',
    organizationModule: 'clips',
    route: createScopedAppRoute({ brandPath: APP_ROUTES.STUDIO.CLIPS }),
    surfaceFlagKey: 'studio_clips',
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.studio,
  },
  {
    activePathRoots: [APP_ROUTES.STUDIO.EDITOR],
    description: 'editor.description',
    icon: Film,
    group: 'app',
    id: 'editor',
    isBrandAware: true,
    label: 'editor.label',
    organizationModule: 'editor',
    route: createScopedAppRoute({ brandPath: APP_ROUTES.STUDIO.EDITOR }),
    surfaceFlagKey: 'studio_editor',
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.studio,
  },
  {
    activePathRoots: ['/automation'],
    description: 'automation.description',
    icon: Workflow,
    group: 'app',
    id: 'automation',
    organizationModule: 'automation',
    label: 'automation.label',
    route: createScopedAppRoute({ brandPath: '/automation/overview' }),
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.automation,
  },
  {
    activePathRoots: ['/messages'],
    description: 'messages.description',
    icon: MessageSquare,
    group: 'app',
    id: 'messages',
    organizationModule: 'messages',
    label: 'messages.label',
    route: createScopedAppRoute({ brandPath: '/messages' }),
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.messages,
  },
  {
    activePathRoots: ['/discovery'],
    description: 'discovery.description',
    icon: TrendingUp,
    group: 'app',
    id: 'discovery',
    organizationModule: 'discovery',
    label: 'discovery.label',
    route: createScopedAppRoute({ brandPath: '/discovery/overview' }),
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.discovery,
  },
];

export const ADMIN_RAIL_APP: AppRailItemConfig = {
  activePathRoots: ['/admin'],
  description: 'admin.description',
  icon: ShieldCheck,
  group: 'admin',
  id: 'admin',
  label: 'admin.label',
  route: () => APP_ROUTES.ADMIN.OVERVIEW.DASHBOARD,
};

function withPreservedSearch(path: string, preservedSearch?: string): string {
  if (!preservedSearch) {
    return path;
  }

  const normalizedSearch = preservedSearch.startsWith('?')
    ? preservedSearch.slice(1)
    : preservedSearch;

  if (!normalizedSearch) {
    return path;
  }

  const [pathname, existingSearch = ''] = path.split('?', 2);
  const mergedSearchParams = new URLSearchParams(existingSearch);
  const preservedSearchParams = new URLSearchParams(normalizedSearch);

  for (const [key, value] of preservedSearchParams.entries()) {
    mergedSearchParams.set(key, value);
  }

  const nextSearch = mergedSearchParams.toString();

  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

function normalizePath(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }

  const [pathname] = path.split('?', 1);
  const normalizedPathname = pathname.replace(/\/+$/, '');

  return normalizedPathname || '/';
}

/**
 * Strip tenant scope so matching is product-root based, like sidebar menus:
 * `/acme/default/studio/storyboard` → `/studio/storyboard`
 * `/acme/~/settings/brands` → `/settings/brands`
 * `/admin/users` → `/admin/users`
 */
function extractProductPath(pathname: string): string {
  const normalized = normalizePath(pathname);
  if (!normalized) {
    return '/';
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) {
    return '/';
  }

  // Global / personal (no org prefix)
  if (
    parts[0] === 'admin' ||
    parts[0] === 'settings' ||
    parts[0] === 'connect' ||
    parts[0] === 'login' ||
    parts[0] === 'sign-up' ||
    parts[0] === 'onboarding'
  ) {
    return `/${parts.join('/')}`;
  }

  // `/:orgSlug/~/:rest*` or `/:orgSlug/:brandSlug/:rest*`
  if (parts.length >= 2) {
    const rest = parts.slice(2);
    return rest.length > 0 ? `/${rest.join('/')}` : '/';
  }

  return `/${parts.join('/')}`;
}

function scoreActivePathRoot(productPath: string, root: string): number {
  const normalizedRoot = normalizePath(root);
  if (!normalizedRoot) {
    return 0;
  }

  if (productPath === normalizedRoot) {
    return normalizedRoot.length + 1000;
  }

  if (productPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedRoot.length;
  }

  return 0;
}

/**
 * Highlight like a menu item: the app whose product root owns the current path.
 * No fallback to a default app — settings / unknown surfaces stay unselected.
 */
export function getActiveAppId(
  apps: readonly AppRailItemConfig[],
  currentPath?: string,
): AppRailItemConfig['id'] | undefined {
  const productPath = extractProductPath(currentPath ?? '');
  if (!productPath || productPath === '/') {
    return undefined;
  }

  let activeAppId: AppRailItemConfig['id'] | undefined;
  let activeScore = 0;

  for (const app of apps) {
    for (const root of app.activePathRoots) {
      const score = scoreActivePathRoot(productPath, root);
      if (score > activeScore) {
        activeAppId = app.id;
        activeScore = score;
      }
    }
  }

  return activeAppId;
}

/**
 * The module flag of the app that owns `currentPath` (#5468): the protected
 * shell answers 404 on a route whose module an operator switched off.
 */
export function getAppRailFlagKeyForPath(
  currentPath?: string,
): AppRailFeatureFlagKey | undefined {
  const appId = getActiveAppId(APP_RAIL_REGISTRY, currentPath);
  return APP_RAIL_REGISTRY.find((app) => app.id === appId)?.visibilityFlagKey;
}

/**
 * Whether the platform switches behind an app are on: its module flag and, for
 * a Studio app, its surface flag. An unknown flag is on only while the flag
 * provider is unconfigured.
 */
export function isAppRailItemEnabled(
  app: AppRailItemConfig,
  flags: Readonly<Record<string, unknown>>,
  isConfigured: boolean,
): boolean {
  return [app.visibilityFlagKey, app.surfaceFlagKey].every(
    (flagKey) =>
      !flagKey ||
      (Object.hasOwn(flags, flagKey) ? flags[flagKey] === true : !isConfigured),
  );
}

export function getAppRailHref(
  app: AppRailItemConfig,
  scope: AppRailScope,
): string {
  const brandSlug = app.isBrandAware
    ? (scope.brandSlug ?? scope.brandAwareSlug)
    : scope.brandSlug;
  return withPreservedSearch(
    app.route(scope.orgSlug, brandSlug),
    scope.preservedSearch,
  );
}

export function isAppRailItemLocked(
  app: AppRailItemConfig,
  isAssetGateLocked = false,
): boolean {
  return (
    isAssetGateLocked && ['workspace', 'library', 'analytics'].includes(app.id)
  );
}

export function getAppRailShortcut(
  index: number,
  isDesktop: boolean,
): string[] {
  return [isDesktop ? '⌘' : 'G', String(index + 1)];
}
