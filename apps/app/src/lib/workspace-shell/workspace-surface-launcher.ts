import type {
  ResolvedWorkspaceShellRoute,
  ResolveWorkspaceSurfaceLaunchParams,
  WorkspaceShellRouteMode,
  WorkspaceSurfaceLaunch,
} from '@genfeedai/interfaces/ui/workspace-shell.interface';
import { resolveWorkspaceShellRoute } from './workspace-shell-registry';

export type {
  ResolveWorkspaceSurfaceLaunchParams,
  WorkspaceSurfaceLaunch,
} from '@genfeedai/interfaces/ui/workspace-shell.interface';

const INTERNAL_ORIGIN = 'https://workspace.genfeed.invalid';

function parseInternalHref(href: string): URL | null {
  try {
    const url = new URL(href, INTERNAL_ORIGIN);
    return url.origin === INTERNAL_ORIGIN ? url : null;
  } catch {
    return null;
  }
}

function toRelativeHref(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function isSafeOpaqueId(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      value !== 'undefined' &&
      value !== 'null' &&
      /^[A-Za-z0-9_-]+$/.test(value),
  );
}

function getCurrentThreadId(
  currentUrl: URL,
  explicitThreadId: string | null | undefined,
): string | null {
  if (isSafeOpaqueId(explicitThreadId)) {
    return explicitThreadId;
  }

  const queryThreadId = currentUrl.searchParams.get('thread');
  if (isSafeOpaqueId(queryThreadId)) {
    return queryThreadId;
  }

  const currentRoute = resolveWorkspaceShellRoute(currentUrl.pathname);
  const routeThreadId = currentRoute?.params.id;

  return currentRoute?.surfaceKey === 'agent-conversation' &&
    isSafeOpaqueId(routeThreadId)
    ? routeThreadId
    : null;
}

function stripOverlayParams(url: URL): void {
  url.searchParams.delete('overlay');
  url.searchParams.delete('overlayRef');
}

function stripAllShellParams(url: URL): void {
  stripOverlayParams(url);
  url.searchParams.delete('thread');
}

function createUnavailableLaunch(
  currentUrl: URL | null,
): WorkspaceSurfaceLaunch {
  return {
    adapter: null,
    announcement: 'Surface unavailable.',
    history: 'none',
    href: currentUrl ? toRelativeHref(currentUrl) : '/',
    mode: 'dedicated',
    registryKey: null,
  };
}

function resolveRetainedThreadId(
  currentUrl: URL | null,
  currentRoute: ResolvedWorkspaceShellRoute | null,
  destinationRoute: ResolvedWorkspaceShellRoute,
  explicitThreadId: string | null | undefined,
): string | null {
  if (!currentUrl) {
    return null;
  }

  const currentOrganizationSlug = currentRoute?.params.orgSlug;
  const destinationOrganizationSlug = destinationRoute.params.orgSlug;
  if (
    !currentOrganizationSlug ||
    !destinationOrganizationSlug ||
    currentOrganizationSlug !== destinationOrganizationSlug
  ) {
    return null;
  }

  return getCurrentThreadId(currentUrl, explicitThreadId);
}

function applyCanvasLaunch(url: URL, retainedThreadId: string | null): void {
  stripOverlayParams(url);
  if (retainedThreadId) {
    url.searchParams.set('thread', retainedThreadId);
  } else {
    url.searchParams.delete('thread');
  }
}

function applyConversationLaunch(
  url: URL,
  route: ResolvedWorkspaceShellRoute,
  retainedThreadId: string | null,
): void {
  stripAllShellParams(url);
  if (retainedThreadId && route.canonicalUrl.endsWith('/agent')) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(retainedThreadId)}`;
  }
}

function applyDestinationPolicy(
  url: URL,
  route: ResolvedWorkspaceShellRoute,
  retainedThreadId: string | null,
): void {
  switch (route.mode) {
    case 'canvas':
      applyCanvasLaunch(url, retainedThreadId);
      return;
    case 'conversation':
      applyConversationLaunch(url, route, retainedThreadId);
      return;
    case 'dedicated':
      stripAllShellParams(url);
  }
}

function formatAnnouncement(
  surfaceKey: string,
  mode: WorkspaceShellRouteMode,
): string {
  const label = surfaceKey.replaceAll('-', ' ');

  if (mode === 'dedicated') {
    return `Opening ${label} as a dedicated route.`;
  }

  return `Opening ${label} in ${mode} mode.`;
}

/**
 * Resolves one explicit user launch through the trusted application registry.
 * Unknown routes fail closed without navigation. The current thread is carried
 * only within the same organization.
 */
export function resolveWorkspaceSurfaceLaunch({
  currentHref,
  destinationHref,
  threadId,
}: ResolveWorkspaceSurfaceLaunchParams): WorkspaceSurfaceLaunch {
  const currentUrl = parseInternalHref(currentHref);
  const destinationUrl = parseInternalHref(destinationHref);

  if (!destinationUrl) {
    return createUnavailableLaunch(currentUrl);
  }

  const currentRoute = currentUrl
    ? resolveWorkspaceShellRoute(currentUrl.pathname)
    : null;
  const destinationRoute = resolveWorkspaceShellRoute(destinationUrl.pathname);

  if (!destinationRoute) {
    return createUnavailableLaunch(currentUrl);
  }

  const retainedThreadId = resolveRetainedThreadId(
    currentUrl,
    currentRoute,
    destinationRoute,
    threadId,
  );
  applyDestinationPolicy(destinationUrl, destinationRoute, retainedThreadId);

  return {
    adapter: destinationRoute.adapter,
    announcement: formatAnnouncement(
      destinationRoute.surfaceKey,
      destinationRoute.mode,
    ),
    history: 'push',
    href: toRelativeHref(destinationUrl),
    mode: destinationRoute.mode,
    registryKey: destinationRoute.key,
  };
}
