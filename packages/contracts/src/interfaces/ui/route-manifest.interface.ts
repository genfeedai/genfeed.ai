import type { AppRailFeatureFlagKey } from '../../constants/feature-flags.constant';
import type { OrganizationModuleId } from '../../constants/organization-modules.constant';
import type { ReleaseItemId } from '../../constants/release-items.constant';
import type {
  WorkspaceShellAdapterSeam,
  WorkspaceShellProductClass,
  WorkspaceShellRouteMode,
  WorkspaceShellSurfaceKey,
} from './workspace-shell.interface';

/** Where a route is served: personal (no org), organization (`/:orgSlug/~`) or brand (`/:orgSlug/:brandSlug`). */
export type RouteManifestScope = 'brand' | 'organization' | 'personal';

/** Apps that open from the app rail: the daily loop and the Apps launcher. */
export type RouteManifestAppId =
  | 'agent'
  | 'analytics'
  | 'automation'
  | 'clipper'
  | 'discovery'
  | 'editor'
  | 'library'
  | 'messages'
  | 'motion'
  | 'playground'
  | 'publishing'
  | 'storyboard'
  | 'turbo'
  | 'workspace';

/** One admin rail icon; it lists the admin pages whose `menu.category` is its id. */
export type AdminRailCategoryId =
  | 'admin-overview'
  | 'admin-customers'
  | 'admin-content'
  | 'admin-automation'
  | 'admin-economics'
  | 'admin-platform';

/**
 * A product app on the rail. The rail, the bare-root redirects and the
 * breadcrumb root labels derive from this entry; the rail icon is the one thing
 * that stays in the UI package.
 */
export interface RouteManifestApp {
  id: RouteManifestAppId;
  /** `daily` is the fixed core loop; `app` entries open from the Apps launcher. */
  group: 'app' | 'daily';
  /** Scope-relative path the rail opens, for an organization and for a brand. */
  homePath: string;
  /** URL root of the app (`/publishing`); it lights the rail item. */
  rootPath: string;
  /** Further path roots that light the rail item. */
  extraActivePathRoots?: readonly string[];
  /** Platform module switch behind the app. */
  flag?: AppRailFeatureFlagKey;
  organizationModule?: OrganizationModuleId;
  /** Release item for an app with no organization module (the Agent app). */
  releaseItemId?: ReleaseItemId;
  isBrandAware?: boolean;
  /**
   * Bare `/<app>` permanently redirects here, unscoped, brand-scoped and
   * org-scoped alike, so the app home is a complete path.
   */
  bareRootRedirect?: string;
}

/** One page of a route group. A bare string is a page with no extras. */
export interface RouteManifestPage {
  /**
   * Scope-relative path pattern (`/publishing/posts/:id`). `/` is the scope
   * root: `/:orgSlug/:brandSlug` for a brand, `/:orgSlug` for an organization.
   */
  path: string;
  /** Narrows the group's scopes for this page. */
  scopes?: readonly RouteManifestScope[];
  /** Breadcrumb leaf label; the default is the last static segment, title-cased. */
  title?: string;
  /** Breadcrumb parent crumb, with the scope-relative path it links to. */
  parent?: { href: string; label: string };
  /** Where the breadcrumb root crumb links, when not the app root. */
  rootHref?: string;
  /** `pages.help.<key>` catalog entry; the path is the help prefix for nested pages. */
  help?: string;
  /** The page renders `AgentOutputShell` (agent on the left, output on the right). */
  isAgentOutput?: boolean;
}

/**
 * Pages that share one workspace-shell contract. `fallback` is scope-relative,
 * or an absolute pattern when it starts with `/:orgSlug`.
 */
export interface RouteManifestGroup {
  scopes: readonly RouteManifestScope[];
  surfaceKey: WorkspaceShellSurfaceKey;
  mode: WorkspaceShellRouteMode;
  productClass: WorkspaceShellProductClass;
  telemetryClass: 'agent' | 'management' | 'product';
  fallback: string;
  switcherItems?: readonly string[];
  adapter?: WorkspaceShellAdapterSeam;
  adapterStatus?: WorkspaceShellAdapterSeam['status'];
  pages: readonly (RouteManifestPage | string)[];
}

/** The Admin sidebar entry of an admin page. */
export interface RouteManifestAdminMenu {
  /** Keys the menu icon in the UI package. */
  id: string;
  label: string;
  category: AdminRailCategoryId;
  group?: string;
  /** Paths that keep the entry active; defaults to the page path. */
  matchPaths?: readonly string[];
  isExactMatch?: boolean;
}

/** A detail or child page of an admin page; it shares that page's shell contract. */
export interface RouteManifestAdminSubpage {
  path: string;
  /** Breadcrumb leaf label; the default is the last static segment, title-cased. */
  title?: string;
}

export interface RouteManifestAdminPage {
  path: string;
  /** Breadcrumb leaf label; the default is the last static segment, title-cased. */
  title?: string;
  subpaths?: readonly (RouteManifestAdminSubpage | string)[];
  productClass?: Extract<
    WorkspaceShellProductClass,
    'control-plane' | 'visual-data'
  >;
  /** Absent for a page that has no sidebar entry. */
  menu?: RouteManifestAdminMenu;
}

export interface RouteManifestAdminCategory {
  id: AdminRailCategoryId;
  /** Translation key prefix under common.appRail (`adminOverview.label`). */
  labelKey: string;
  homePath: string;
  activePathRoots: readonly string[];
}

export interface RouteManifest {
  apps: readonly RouteManifestApp[];
  groups: readonly RouteManifestGroup[];
  adminCategories: readonly RouteManifestAdminCategory[];
  adminPages: readonly RouteManifestAdminPage[];
}
