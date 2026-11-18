import {
  APP_ROUTES,
  type AppRailFeatureFlagKey,
  createBrandAppRoute,
  createOrganizationAppRoute,
  isPlatformFlagOn,
  ROUTE_MANIFEST_ADMIN_CATEGORIES,
  ROUTE_MANIFEST_APPS,
} from '@genfeedai/contracts/constants';
import type {
  AdminRailCategoryId,
  AppRailItemConfig,
  AppRailScope,
  AppRailScopedRouteOptions,
} from '@genfeedai/contracts/interfaces/ui/app-rail.interface';
import type { RouteManifestAppId } from '@genfeedai/contracts/interfaces/ui/route-manifest.interface';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import { GalleryHorizontalStart } from '@ui/primitives/animated-icons/custom-lucide';
import {
  ArrowLeft,
  BotMessageSquare,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  ChartPie,
  Clapperboard,
  Gauge,
  HandCoins,
  LayoutGrid,
  LibraryBig,
  MessageSquare,
  Newspaper,
  Radar,
  Rocket,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SquarePlay,
  Workflow,
} from 'lucide-react';
import { getActiveAppId } from './app-rail.active-app';

export { getActiveAppId };

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
 * Rail icons by app. Everything else about a rail app (route, flag, module,
 * active roots) is declared once on its route manifest entry.
 */
const APP_RAIL_ICONS: Readonly<Record<RouteManifestAppId, IconComponent>> = {
  agent: BotMessageSquare,
  analytics: ChartPie,
  automation: Workflow,
  clipper: GalleryHorizontalStart,
  discovery: Radar,
  editor: Scissors,
  library: LibraryBig,
  messages: MessageSquare,
  motion: SquarePlay,
  playground: Sparkles,
  publishing: CalendarDays,
  storyboard: Clapperboard,
  turbo: Rocket,
  workspace: LayoutGrid,
};

/**
 * The daily loop is fixed on the rail: workspace, agent, library, publishing,
 * analytics. Every other native app opens directly from the Apps launcher
 * once the member installs it, and can be pinned below the loop (#5502).
 * Studio tools are separate apps; there is no Studio parent. Derived from the
 * route manifest, in manifest order.
 */
export const APP_RAIL_REGISTRY: readonly AppRailItemConfig[] =
  ROUTE_MANIFEST_APPS.map((app) => ({
    activePathRoots: [app.rootPath, ...(app.extraActivePathRoots ?? [])],
    description: `${app.id}.description`,
    group: app.group,
    icon: APP_RAIL_ICONS[app.id],
    id: app.id,
    label: `${app.id}.label`,
    route: createScopedAppRoute({ brandPath: app.homePath }),
    isBrandAware: app.isBrandAware,
    organizationModule: app.organizationModule,
    releaseItemId: app.releaseItemId,
    visibilityFlagKey: app.flag,
  }));

/**
 * Where a rail app opens for an organization and, when it has one, a brand.
 * Null for an id that is not a rail app.
 */
export function getRailAppRoute(
  appId: string,
  orgSlug: string,
  brandSlug?: string,
): string | null {
  const app = APP_RAIL_REGISTRY.find((candidate) => candidate.id === appId);
  return app ? app.route(orgSlug, brandSlug) : null;
}

export const ADMIN_RAIL_APP: AppRailItemConfig = {
  activePathRoots: ['/admin'],
  description: 'admin.description',
  icon: ShieldCheck,
  group: 'admin',
  id: 'admin',
  label: 'admin.label',
  route: () => APP_ROUTES.ADMIN.OVERVIEW.ROOT,
};

/**
 * Admin chrome ends with this back button, in the bottom slot where the app
 * rail shows the Admin entry: it leaves Admin for the workspace the member
 * came from. It carries no `activePathRoots`, so it is never the active rail
 * item.
 */
export const ADMIN_RAIL_BACK_APP: AppRailItemConfig = {
  activePathRoots: [],
  description: 'adminBack.description',
  group: 'admin-exit',
  icon: ArrowLeft,
  id: 'admin-back',
  label: 'adminBack.label',
  route: createScopedAppRoute({ brandPath: '/workspace/overview' }),
};

/**
 * Admin rail icons by category. The category itself (home, active roots) is
 * declared on its route manifest entry.
 */
const ADMIN_RAIL_CATEGORY_ICONS: Readonly<
  Record<AdminRailCategoryId, IconComponent>
> = {
  'admin-automation': Brain,
  'admin-content': Newspaper,
  'admin-customers': BriefcaseBusiness,
  'admin-economics': HandCoins,
  'admin-overview': Gauge,
  'admin-platform': SlidersHorizontal,
};

/**
 * Admin chrome swaps the app loop for these: one icon per admin category, each
 * opening that category's pages in the sidebar (`category` on the matching
 * `ADMIN_MENU_ITEMS`). The longest root wins, so Organizations (an
 * `/admin/overview/analytics/...` URL) still lands in Customers.
 */
export const ADMIN_RAIL_CATEGORIES: readonly AppRailItemConfig[] =
  ROUTE_MANIFEST_ADMIN_CATEGORIES.map((category) => ({
    activePathRoots: category.activePathRoots,
    description: `${category.labelKey}.description`,
    group: 'admin-category',
    icon: ADMIN_RAIL_CATEGORY_ICONS[category.id],
    id: category.id,
    label: `${category.labelKey}.label`,
    route: () => category.homePath,
  }));

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
 * Whether the platform switch behind an app is on, by the one flag rule
 * (`isPlatformFlagOn`): an explicit boolean wins and a flag the API does not
 * carry yet takes its default.
 */
export function isAppRailItemEnabled(
  app: AppRailItemConfig,
  flags: Readonly<Record<string, unknown>>,
): boolean {
  return (
    !app.visibilityFlagKey || isPlatformFlagOn(flags, app.visibilityFlagKey)
  );
}

/** Whether the app that owns `path` is switched on. */
export function isAppRailPathEnabled(
  path: string | null | undefined,
  flags: Readonly<Record<string, unknown>>,
): boolean {
  const flagKey = getAppRailFlagKeyForPath(path ?? undefined);
  return flagKey === undefined || isPlatformFlagOn(flags, flagKey);
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
