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
  Home,
  Images,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
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
 * The daily loop sits on the rail: workspace, agent, library, publishing,
 * analytics. Studio, automation, messages and discovery stay in More until
 * the signed-in user pins them. Discovery is research that helps the loop;
 * it is not part of publishing or analytics.
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
    label: 'analytics.label',
    route: createScopedAppRoute({ brandPath: '/analytics/overview' }),
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.analytics,
  },
  {
    activePathRoots: ['/studio'],
    description: 'studio.description',
    icon: Sparkles,
    group: 'more',
    id: 'studio',
    isBrandAware: true,
    label: 'studio.label',
    // Studio production tools require a brand. The org route hands one-off
    // generation to Agent while preserving a stable rail destination.
    route: createScopedAppRoute({
      brandPath: '/studio/playground',
      organizationPath: '/studio',
    }),
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.studio,
  },
  {
    activePathRoots: ['/automation'],
    description: 'automation.description',
    icon: Workflow,
    group: 'more',
    id: 'automation',
    label: 'automation.label',
    route: createScopedAppRoute({ brandPath: '/automation/overview' }),
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.automation,
  },
  {
    activePathRoots: ['/messages'],
    description: 'messages.description',
    icon: MessageSquare,
    group: 'more',
    id: 'messages',
    label: 'messages.label',
    route: createScopedAppRoute({ brandPath: '/messages' }),
    visibilityFlagKey: APP_RAIL_FEATURE_FLAGS.messages,
  },
  {
    activePathRoots: ['/discovery'],
    description: 'discovery.description',
    icon: TrendingUp,
    group: 'more',
    id: 'discovery',
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
