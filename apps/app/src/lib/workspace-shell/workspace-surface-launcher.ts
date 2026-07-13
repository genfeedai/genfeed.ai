import {
  resolveWorkspaceShellRoute,
  type WorkspaceShellAdapterSeam,
  type WorkspaceShellRouteMode,
} from './workspace-shell-registry';

export type WorkspaceSurfaceLaunch = {
  readonly adapter: WorkspaceShellAdapterSeam | null;
  readonly announcement: string;
  readonly history: 'none' | 'push';
  readonly href: string;
  readonly mode: WorkspaceShellRouteMode;
  readonly registryKey: string | null;
};

type ResolveWorkspaceSurfaceLaunchParams = {
  readonly currentHref: string;
  readonly destinationHref: string;
  readonly threadId?: string | null;
};

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
    return {
      adapter: null,
      announcement: 'Surface unavailable.',
      history: 'none',
      href: currentUrl ? toRelativeHref(currentUrl) : '/',
      mode: 'dedicated',
      registryKey: null,
    };
  }

  const currentRoute = currentUrl
    ? resolveWorkspaceShellRoute(currentUrl.pathname)
    : null;
  const destinationRoute = resolveWorkspaceShellRoute(destinationUrl.pathname);

  if (!destinationRoute) {
    return {
      adapter: null,
      announcement: 'Surface unavailable.',
      history: 'none',
      href: currentUrl ? toRelativeHref(currentUrl) : '/',
      mode: 'dedicated',
      registryKey: null,
    };
  }

  const currentOrganizationSlug = currentRoute?.params.orgSlug ?? null;
  const destinationOrganizationSlug = destinationRoute.params.orgSlug ?? null;
  const canRetainThread = Boolean(
    currentOrganizationSlug &&
      destinationOrganizationSlug &&
      currentOrganizationSlug === destinationOrganizationSlug,
  );
  const retainedThreadId =
    canRetainThread && currentUrl
      ? getCurrentThreadId(currentUrl, threadId)
      : null;

  if (destinationRoute.mode === 'canvas') {
    stripOverlayParams(destinationUrl);
    if (retainedThreadId) {
      destinationUrl.searchParams.set('thread', retainedThreadId);
    } else {
      destinationUrl.searchParams.delete('thread');
    }
  } else if (destinationRoute.mode === 'conversation') {
    stripAllShellParams(destinationUrl);
    if (retainedThreadId && destinationRoute.canonicalUrl.endsWith('/agent')) {
      destinationUrl.pathname = `${destinationUrl.pathname.replace(/\/$/, '')}/${encodeURIComponent(retainedThreadId)}`;
    }
  } else {
    stripAllShellParams(destinationUrl);
  }

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
