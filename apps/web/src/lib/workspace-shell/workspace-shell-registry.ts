import {
  APP_DISPLAY_LABELS,
  ROUTE_MANIFEST,
} from '@genfeedai/contracts/constants';
import type {
  RouteManifest,
  RouteManifestAdminPage,
  RouteManifestGroup,
  RouteManifestPage,
  RouteManifestScope,
} from '@genfeedai/contracts/interfaces/ui/route-manifest.interface';
import type {
  ResolvedWorkspaceShellRoute,
  WorkspaceShellAccessPolicy,
  WorkspaceShellAdapterSeam,
  WorkspaceShellBreadcrumbMetadata,
  WorkspaceShellDeployment,
  WorkspaceShellOverlayRegistration,
  WorkspaceShellProductClass,
  WorkspaceShellRestorationPolicy,
  WorkspaceShellRouteMode,
  WorkspaceShellRouteRegistration,
  WorkspaceShellScopeRequirement,
  WorkspaceShellSurfaceKey,
} from '@genfeedai/contracts/interfaces/ui/workspace-shell.interface';
import {
  compilePathPattern,
  listManifestPages,
  toScopedHref,
  toScopedPattern,
} from './route-manifest.util';
import { parseInternalHref } from './workspace-shell-url.util';

export type {
  ResolvedWorkspaceShellRoute,
  WorkspaceShellAccessPolicy,
  WorkspaceShellAdapterSeam,
  WorkspaceShellAvailability,
  WorkspaceShellBreadcrumbMetadata,
  WorkspaceShellDeployment,
  WorkspaceShellLaunchTarget,
  WorkspaceShellOverlayRegistration,
  WorkspaceShellProductClass,
  WorkspaceShellRestorationPolicy,
  WorkspaceShellRouteMode,
  WorkspaceShellRouteRegistration,
  WorkspaceShellScopeRequirement,
  WorkspaceShellSurfaceKey,
  WorkspaceShellSurfaceMode,
} from '@genfeedai/contracts/interfaces/ui/workspace-shell.interface';

const ROUTE_PARAMS_PATTERN = /:([A-Za-z][A-Za-z0-9]*)/g;
const SCOPE_ORDER = [
  'personal',
  'organization',
  'brand',
] as const satisfies readonly RouteManifestScope[];
const ADMIN_FALLBACK = '/admin/overview';

type RouteGroupConfig = {
  readonly adapterStatus?: WorkspaceShellRouteRegistration['adapter']['status'];
  readonly adapter?: WorkspaceShellAdapterSeam;
  readonly fallback: string;
  readonly mode: WorkspaceShellRouteMode;
  readonly productClass: WorkspaceShellProductClass;
  readonly scope: WorkspaceShellScopeRequirement;
  readonly surfaceKey: WorkspaceShellSurfaceKey;
  readonly switcherItems?: readonly string[];
  readonly telemetryClass: WorkspaceShellRouteRegistration['telemetryClass'];
};

type CompiledRouteRegistration = {
  readonly matcher: RegExp;
  readonly parameterNames: readonly string[];
  readonly registration: WorkspaceShellRouteRegistration;
  readonly specificity: number;
};

const ALL_DEPLOYMENTS = Object.freeze([
  'cloud-web',
  'self-hosted-web',
  'desktop',
] as const satisfies readonly WorkspaceShellDeployment[]);

const URL_RESTORATION_POLICY = Object.freeze({
  history: 'canonical-url',
  invalidShellParams: 'replace',
  searchParams: 'preserve-opaque',
} as const satisfies WorkspaceShellRestorationPolicy);

const RESERVED_SCOPED_ROUTE_PREFIXES = Object.freeze([
  'admin',
  'connect',
  'settings',
  'support',
]);

const ACCESS_POLICY_BY_SCOPE = Object.freeze({
  brand: 'brand-member',
  organization: 'organization-member',
  personal: 'authenticated',
  'platform-admin': 'platform-admin',
} as const satisfies Record<
  WorkspaceShellScopeRequirement,
  WorkspaceShellAccessPolicy
>);

const ADAPTER_STATUS_BY_MODE = Object.freeze({
  canvas: 'placeholder',
  conversation: 'placeholder',
  dedicated: 'dedicated-route',
} as const satisfies Record<
  WorkspaceShellRouteMode,
  WorkspaceShellRouteRegistration['adapter']['status']
>);

const AVAILABILITY_BY_MODE = Object.freeze({
  canvas: 'conversation-shell',
  conversation: 'conversation-shell',
  dedicated: 'always',
} as const satisfies Record<
  WorkspaceShellRouteMode,
  WorkspaceShellRouteRegistration['availability']
>);

const LAUNCH_TARGET_BY_MODE = Object.freeze({
  canvas: 'focused-canvas',
  conversation: 'inline',
  dedicated: 'dedicated-route',
} as const satisfies Record<
  WorkspaceShellRouteMode,
  WorkspaceShellRouteRegistration['launchTarget']
>);

const BREADCRUMB_ROOT_LABELS = Object.freeze({
  admin: APP_DISPLAY_LABELS.admin,
  agent: APP_DISPLAY_LABELS.agent,
  analytics: APP_DISPLAY_LABELS.analytics,
  automation: APP_DISPLAY_LABELS.automation,
  clipper: APP_DISPLAY_LABELS.clipper,
  edit: 'Edit',
  editor: APP_DISPLAY_LABELS.editor,
  library: APP_DISPLAY_LABELS.library,
  messages: APP_DISPLAY_LABELS.messages,
  motion: APP_DISPLAY_LABELS.motion,
  overview: APP_DISPLAY_LABELS.workspace,
  platforms: 'Platforms',
  playground: APP_DISPLAY_LABELS.playground,
  publishing: APP_DISPLAY_LABELS.publishing,
  discovery: APP_DISPLAY_LABELS.discovery,
  settings: 'Settings',
  storyboard: APP_DISPLAY_LABELS.storyboard,
  turbo: APP_DISPLAY_LABELS.turbo,
  workspace: APP_DISPLAY_LABELS.workspace,
} as const satisfies Readonly<Record<string, string>>);

const BREADCRUMB_WORD_LABELS = Object.freeze({
  api: 'API',
  gifs: 'GIFs',
  id: 'ID',
} as const satisfies Readonly<Record<string, string>>);

function humanizeBreadcrumbLabel(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((word) => {
      const normalizedWord = word.toLowerCase();
      return (
        BREADCRUMB_WORD_LABELS[
          normalizedWord as keyof typeof BREADCRUMB_WORD_LABELS
        ] ??
        `${normalizedWord.charAt(0).toUpperCase()}${normalizedWord.slice(1)}`
      );
    })
    .join(' ');
}

function getCanonicalRootSegment(canonicalUrl: string): string {
  if (canonicalUrl === '/') {
    return 'workspace';
  }

  const segments = canonicalUrl.split('/').filter(Boolean);
  if (segments[0] === 'admin' || segments[0] === 'settings') {
    return segments[0];
  }

  if (segments[0] === ':orgSlug') {
    if (segments.length === 1) {
      return 'workspace';
    }

    return segments[1] === '~'
      ? (segments[2] ?? 'overview')
      : (segments[2] ?? 'workspace');
  }

  return segments[0] ?? 'workspace';
}

function getDefaultBreadcrumbLeafLabel(canonicalUrl: string): string {
  const segments = canonicalUrl.split('/').filter(Boolean);
  const lastStaticSegment = [...segments]
    .reverse()
    .find((segment) => !segment.startsWith(':') && segment !== '~');

  return humanizeBreadcrumbLabel(lastStaticSegment ?? 'overview');
}

function getRouteBreadcrumbMetadata(
  canonicalUrl: string,
  overrides: Partial<WorkspaceShellBreadcrumbMetadata>,
): WorkspaceShellBreadcrumbMetadata {
  const appSegment = getCanonicalRootSegment(canonicalUrl);
  const rootLabel =
    BREADCRUMB_ROOT_LABELS[appSegment as keyof typeof BREADCRUMB_ROOT_LABELS] ??
    humanizeBreadcrumbLabel(appSegment);

  return Object.freeze({
    leafLabel:
      overrides.leafLabel ?? getDefaultBreadcrumbLeafLabel(canonicalUrl),
    ...(overrides.parentLabel ? { parentLabel: overrides.parentLabel } : {}),
    ...(overrides.parentHref ? { parentHref: overrides.parentHref } : {}),
    rootLabel,
    ...(overrides.rootHref ? { rootHref: overrides.rootHref } : {}),
  });
}

function resolveBreadcrumbMetadata(
  breadcrumb: WorkspaceShellBreadcrumbMetadata,
  params: Readonly<Record<string, string>>,
): WorkspaceShellBreadcrumbMetadata {
  const leafLabel = breadcrumb.leafLabel.replace(
    ROUTE_PARAMS_PATTERN,
    (_, parameterName: string) =>
      humanizeBreadcrumbLabel(params[parameterName] ?? parameterName),
  );
  const parentLabel = breadcrumb.parentLabel?.replace(
    ROUTE_PARAMS_PATTERN,
    (_, parameterName: string) =>
      humanizeBreadcrumbLabel(params[parameterName] ?? parameterName),
  );

  return Object.freeze({
    ...breadcrumb,
    leafLabel,
    ...(parentLabel ? { parentLabel } : {}),
  });
}

function freezeRouteRegistration(
  canonicalUrl: string,
  config: RouteGroupConfig,
  breadcrumb: WorkspaceShellBreadcrumbMetadata,
): WorkspaceShellRouteRegistration {
  return Object.freeze({
    accessPolicy: ACCESS_POLICY_BY_SCOPE[config.scope],
    adapter: Object.freeze(
      config.adapter ?? {
        key: config.surfaceKey,
        status: config.adapterStatus ?? ADAPTER_STATUS_BY_MODE[config.mode],
      },
    ),
    allowedShellModes: Object.freeze([config.mode] as const),
    availability: AVAILABILITY_BY_MODE[config.mode],
    breadcrumb,
    canonicalUrl,
    deployments: ALL_DEPLOYMENTS,
    key: `route:${canonicalUrl}`,
    kind: 'route',
    launchTarget: LAUNCH_TARGET_BY_MODE[config.mode],
    mode: config.mode,
    productClass: config.productClass,
    restoration: URL_RESTORATION_POLICY,
    safeFallback: config.fallback,
    scope: config.scope,
    surfaceKey: config.surfaceKey,
    switcherItems: Object.freeze([...(config.switcherItems ?? [])]),
    telemetryClass: config.telemetryClass,
  });
}

function registerManifestPage(
  scope: RouteManifestScope,
  group: RouteManifestGroup,
  page: RouteManifestPage,
): WorkspaceShellRouteRegistration {
  const canonicalUrl = toScopedPattern(scope, page.path);
  const parentHref = page.parent?.href;

  return freezeRouteRegistration(
    canonicalUrl,
    {
      adapter: group.adapter,
      adapterStatus: group.adapterStatus,
      fallback: toScopedHref(scope, group.fallback),
      mode: group.mode,
      productClass: group.productClass,
      scope,
      surfaceKey: group.surfaceKey,
      switcherItems: group.switcherItems,
      telemetryClass: group.telemetryClass,
    },
    getRouteBreadcrumbMetadata(canonicalUrl, {
      ...(page.title ? { leafLabel: page.title } : {}),
      ...(page.parent ? { parentLabel: page.parent.label } : {}),
      ...(parentHref ? { parentHref } : {}),
      ...(page.rootHref ? { rootHref: page.rootHref } : {}),
    }),
  );
}

function registerAdminPage(
  page: RouteManifestAdminPage,
  path: string,
  title: string | undefined,
): WorkspaceShellRouteRegistration {
  return freezeRouteRegistration(
    path,
    {
      fallback: ADMIN_FALLBACK,
      mode: 'canvas',
      productClass: page.productClass ?? 'control-plane',
      scope: 'platform-admin',
      surfaceKey: 'platform-admin',
      switcherItems: ['admin'],
      telemetryClass: 'management',
    },
    getRouteBreadcrumbMetadata(path, title ? { leafLabel: title } : {}),
  );
}

/**
 * The shell registrations of a route manifest: personal, organization and
 * brand pages in group order, then the admin pages.
 */
export function buildProtectedRouteInventory(
  manifest: RouteManifest = ROUTE_MANIFEST,
): readonly WorkspaceShellRouteRegistration[] {
  const scopedRegistrations = SCOPE_ORDER.flatMap((scope) =>
    listManifestPages(manifest)
      .filter((entry) => entry.scopes.includes(scope))
      .map(({ group, page }) => registerManifestPage(scope, group, page)),
  );
  const adminRegistrations = manifest.adminPages.flatMap((page) => [
    registerAdminPage(page, page.path, page.title),
    ...(page.subpaths ?? []).map((subpath) =>
      typeof subpath === 'string'
        ? registerAdminPage(page, subpath, undefined)
        : registerAdminPage(page, subpath.path, subpath.title),
    ),
  ]);

  return [...scopedRegistrations, ...adminRegistrations];
}

/**
 * Canonical application-owned inventory for the protected route patterns
 * accepted in ADR-CONVERSATION-SHELL-CONTRACTS v1.0.0 plus routes added after
 * its 206-route snapshot. Retired
 * `/automation/strategies` is a hard cut: the `:agentId` pattern must not
 * treat that slug as a live agent. Org Workspace lives at
 * `/:orgSlug/~/workspace/*`.
 */
export const PROTECTED_ROUTE_INVENTORY = Object.freeze(
  buildProtectedRouteInventory(),
);

export const WORKSPACE_SHELL_OVERLAY_REGISTRY = Object.freeze([
  Object.freeze({
    accessPolicy: 'organization-member',
    adapter: Object.freeze({ key: 'library-picker', status: 'ready' }),
    allowedShellModes: Object.freeze(['overlay'] as const),
    availability: 'conversation-shell',
    canonicalUrl: null,
    deployments: ALL_DEPLOYMENTS,
    key: 'library-picker',
    kind: 'overlay',
    launchTarget: 'overlay',
    presentation: Object.freeze({
      description:
        'Choose an authorized media source without leaving the active conversation.',
      openAnnouncement: 'Library picker opened.',
      title: 'Choose from Library',
    }),
    restoration: URL_RESTORATION_POLICY,
    safeFallback: 'same-canonical-url',
    scope: 'organization',
    telemetryClass: 'library_picker',
  }),
  Object.freeze({
    accessPolicy: 'organization-member',
    adapter: Object.freeze({ key: 'notifications', status: 'placeholder' }),
    allowedShellModes: Object.freeze(['overlay'] as const),
    availability: 'conversation-shell',
    canonicalUrl: null,
    deployments: ALL_DEPLOYMENTS,
    key: 'notifications',
    kind: 'overlay',
    launchTarget: 'overlay',
    presentation: Object.freeze({
      description:
        'Review workspace notifications without leaving the active conversation or canvas.',
      openAnnouncement: 'Notifications overlay opened.',
      title: 'Notifications',
    }),
    restoration: URL_RESTORATION_POLICY,
    safeFallback: 'same-canonical-url',
    scope: 'organization',
    telemetryClass: 'notifications',
  }),
  Object.freeze({
    accessPolicy: 'organization-member',
    adapter: Object.freeze({ key: 'workflow-picker', status: 'placeholder' }),
    allowedShellModes: Object.freeze(['overlay'] as const),
    availability: 'conversation-shell',
    canonicalUrl: null,
    deployments: ALL_DEPLOYMENTS,
    key: 'workflow-picker',
    kind: 'overlay',
    launchTarget: 'overlay',
    presentation: Object.freeze({
      description:
        'Choose an authorized deterministic workflow without leaving the active conversation or canvas.',
      openAnnouncement: 'Workflow picker opened.',
      title: 'Choose a workflow',
    }),
    restoration: URL_RESTORATION_POLICY,
    safeFallback: 'same-canonical-url',
    scope: 'organization',
    telemetryClass: 'workflow_picker',
  }),
] as const satisfies readonly WorkspaceShellOverlayRegistration[]);

// Kept local: `check-product-route-inventory` loads this module straight from
// source in a bare Node process, where only workspace packages resolve, not
// the app's `@helpers/*` alias or the unbuilt helpers `dist`.
function compileRoutePattern(
  registration: WorkspaceShellRouteRegistration,
): CompiledRouteRegistration {
  return { ...compilePathPattern(registration.canonicalUrl), registration };
}

const COMPILED_ROUTE_INVENTORY = Object.freeze(
  PROTECTED_ROUTE_INVENTORY.map(compileRoutePattern),
);

function getPathname(value: string): string | null {
  return parseInternalHref(value)?.pathname ?? null;
}

function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isWorkspaceShellHardCut(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  return (
    segments.length === 4 &&
    segments[1] !== '~' &&
    segments[2] === 'automation' &&
    segments[3] === 'strategies'
  );
}

function hasRequiredPathScope(
  pathname: string,
  scope: WorkspaceShellScopeRequirement,
): boolean {
  const segments = pathname.split('/').filter(Boolean);
  const hasReservedPrefix = RESERVED_SCOPED_ROUTE_PREFIXES.some(
    (prefix) => segments[0] === prefix,
  );

  switch (scope) {
    case 'brand':
      return !hasReservedPrefix && segments.length >= 2 && segments[1] !== '~';
    case 'organization':
      return (
        !hasReservedPrefix && (segments.length === 1 || segments[1] === '~')
      );
    case 'personal':
      return (
        pathname === '/' ||
        pathname === '/connect' ||
        pathname.startsWith('/support/') ||
        pathname.startsWith('/settings')
      );
    case 'platform-admin':
      return pathname === '/admin' || pathname.startsWith('/admin/');
  }
}

export function resolveWorkspaceShellRoute(
  hrefOrPathname: string,
): ResolvedWorkspaceShellRoute | null {
  const pathname = getPathname(hrefOrPathname);
  if (!pathname || isWorkspaceShellHardCut(pathname)) {
    return null;
  }

  let bestMatch:
    | (CompiledRouteRegistration & { readonly match: RegExpExecArray })
    | null = null;

  for (const compiled of COMPILED_ROUTE_INVENTORY) {
    if (!hasRequiredPathScope(pathname, compiled.registration.scope)) {
      continue;
    }

    const match = compiled.matcher.exec(pathname);
    if (
      !match ||
      (bestMatch && bestMatch.specificity >= compiled.specificity)
    ) {
      continue;
    }

    bestMatch = { ...compiled, match };
  }

  if (!bestMatch) {
    return null;
  }

  const params = Object.freeze(
    Object.fromEntries(
      bestMatch.parameterNames.map((parameterName, index) => [
        parameterName,
        decodeRouteParam(bestMatch?.match[index + 1] ?? ''),
      ]),
    ),
  );

  return Object.freeze({
    ...bestMatch.registration,
    breadcrumb: resolveBreadcrumbMetadata(
      bestMatch.registration.breadcrumb,
      params,
    ),
    params,
  });
}

export function getWorkspaceShellOverlayRegistration(
  key: string,
): WorkspaceShellOverlayRegistration | null {
  return (
    WORKSPACE_SHELL_OVERLAY_REGISTRY.find(
      (registration) => registration.key === key,
    ) ?? null
  );
}

function interpolateCanonicalPattern(
  pattern: string,
  params: Readonly<Record<string, string>>,
): string | null {
  let isComplete = true;
  const href = pattern.replace(ROUTE_PARAMS_PATTERN, (_, key: string) => {
    const value = params[key];
    if (!value) {
      isComplete = false;
      return '';
    }

    return encodeURIComponent(value);
  });

  return isComplete ? href : null;
}

export function resolveWorkspaceShellSafeFallback(
  route: ResolvedWorkspaceShellRoute,
): string {
  return (
    interpolateCanonicalPattern(route.safeFallback, route.params) ??
    route.canonicalUrl
  );
}
