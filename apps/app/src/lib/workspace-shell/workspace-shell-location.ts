import type {
  RestoreWorkspaceShellLocationParams,
  WorkspaceShellLocation,
  WorkspaceShellOverlayRegistration,
  WorkspaceShellOverlayRequest,
} from '@genfeedai/contracts/interfaces/ui/workspace-shell.interface';
import { appendSearchParamsToHref } from '@/lib/navigation/operator-shell';
import {
  getWorkspaceShellOverlayRegistration,
  resolveWorkspaceShellRoute,
  resolveWorkspaceShellSafeFallback,
} from './workspace-shell-registry';

export type {
  RestoreWorkspaceShellLocationParams,
  WorkspaceShellLocation,
  WorkspaceShellOverlayRequest,
  WorkspaceShellRestorationFailure,
  WorkspaceShellState,
} from '@genfeedai/contracts/interfaces/ui/workspace-shell.interface';

export const WORKSPACE_SHELL_QUERY_KEYS = [
  'overlay',
  'overlayRef',
  'thread',
] as const;

function isSafeOpaqueId(value: string | null): value is string {
  return Boolean(
    value &&
      value !== 'undefined' &&
      value !== 'null' &&
      /^[A-Za-z0-9_-]+$/.test(value),
  );
}

/**
 * Every registered overlay takes no parameters. `overlayRef` is a reserved
 * shell query param stripped during canonicalization below — it is never
 * parsed or attached to a resolved overlay request.
 */
export function createOverlayRequest(
  registration: WorkspaceShellOverlayRegistration,
): WorkspaceShellOverlayRequest {
  return { key: registration.key, parameters: Object.freeze({}) };
}

/**
 * The conversation surface is the only route that carries thread identity, and
 * it carries it in the path. The registry — not a pathname pattern — decides
 * which route that is, so sibling agent routes (`/agent/journey`,
 * `/agent/onboarding`) are never mistaken for a thread id.
 */
function getRouteThreadCandidate(
  route: ReturnType<typeof resolveWorkspaceShellRoute>,
): string | null {
  if (route?.surfaceKey !== 'agent-conversation') {
    return null;
  }

  return route.params.id ?? route.params.threadId ?? null;
}

export function restoreWorkspaceShellLocation({
  pathname,
  searchParams,
}: RestoreWorkspaceShellLocationParams): WorkspaceShellLocation | null {
  const route = resolveWorkspaceShellRoute(pathname);
  if (!route || route.mode === 'dedicated') {
    return null;
  }

  const canonicalSearchParams = new URLSearchParams(searchParams);
  const safeFallbackHref = resolveWorkspaceShellSafeFallback(route);

  // The agent thread lives in the path (`/agent/:id`). It is never a query
  // param: on every other surface the conversation is the inspector drawer,
  // which follows the agent store rather than the URL. `?thread=` is therefore
  // non-canonical everywhere and is always stripped.
  const threadCandidate = getRouteThreadCandidate(route);
  const threadId = isSafeOpaqueId(threadCandidate) ? threadCandidate : null;
  // `overlayRef` is a reserved shell param that no registered overlay takes a
  // parameter through, so a stray value is always dropped during
  // canonicalization rather than treated as a restoration failure.
  const hasOverlayReference = searchParams.has('overlayRef');
  const isCanonical = !searchParams.has('thread') && !hasOverlayReference;
  canonicalSearchParams.delete('thread');
  canonicalSearchParams.delete('overlayRef');

  if (threadCandidate && !threadId) {
    return {
      canonicalSearchParams,
      isCanonical: false,
      overlay: null,
      restorationFailure: 'invalid_thread',
      routeKey: route.key,
      safeFallbackHref,
      state: 'canvas',
      surfaceKey: route.surfaceKey,
      threadId: null,
    };
  }

  const overlayKey = searchParams.get('overlay');
  const overlay = overlayKey
    ? getWorkspaceShellOverlayRegistration(overlayKey)
    : null;

  if (!overlay) {
    if (overlayKey) {
      canonicalSearchParams.delete('overlay');

      return {
        canonicalSearchParams,
        isCanonical: false,
        overlay: null,
        restorationFailure: 'invalid_overlay',
        routeKey: route.key,
        safeFallbackHref,
        state: 'canvas',
        surfaceKey: route.surfaceKey,
        threadId,
      };
    }

    return {
      canonicalSearchParams,
      isCanonical,
      overlay: null,
      restorationFailure: null,
      routeKey: route.key,
      safeFallbackHref,
      state: 'canvas',
      surfaceKey: route.surfaceKey,
      threadId,
    };
  }

  return {
    canonicalSearchParams,
    isCanonical,
    overlay: createOverlayRequest(overlay),
    restorationFailure: null,
    routeKey: route.key,
    safeFallbackHref,
    state: 'overlay',
    surfaceKey: route.surfaceKey,
    threadId,
  };
}

export function buildWorkspaceShellHref(
  href: string,
  params: {
    readonly overlay?: WorkspaceShellOverlayRequest;
  },
): string {
  const shellSearchParams = new URLSearchParams();

  if (params.overlay) {
    shellSearchParams.set('overlay', params.overlay.key);
  }

  return appendSearchParamsToHref(href, shellSearchParams);
}

export function removeWorkspaceShellOverlayParams(
  pathname: string,
  searchParams: URLSearchParams,
): string {
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.delete('overlay');
  nextSearchParams.delete('overlayRef');
  // Dismissing an overlay returns to the canonical underlying URL, which never
  // carries thread identity.
  nextSearchParams.delete('thread');

  return appendSearchParamsToHref(pathname, nextSearchParams);
}
