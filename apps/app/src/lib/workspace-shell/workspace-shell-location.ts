import type {
  RestoreWorkspaceShellLocationParams,
  WorkspaceShellLocation,
  WorkspaceShellOverlayReferenceAccessResolver,
  WorkspaceShellOverlayRegistration,
  WorkspaceShellOverlayRequest,
  WorkspaceShellOverlayResolution,
  WorkspaceShellReferenceKind,
  WorkspaceShellTypedReference,
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
  WorkspaceShellOverlayReferenceAccessResolver,
  WorkspaceShellOverlayRequest,
  WorkspaceShellRestorationFailure,
  WorkspaceShellState,
  WorkspaceShellTypedReference,
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

function parseOverlayReference(
  value: string | null,
  allowedKinds: readonly WorkspaceShellReferenceKind[],
): WorkspaceShellTypedReference | null {
  if (!value) {
    return null;
  }

  const separatorIndex = value.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null;
  }

  const kind = value.slice(0, separatorIndex) as WorkspaceShellReferenceKind;
  const id = value.slice(separatorIndex + 1);

  if (!allowedKinds.includes(kind) || !isSafeOpaqueId(id)) {
    return null;
  }

  return { id, kind };
}

function createOverlayRequest(
  registration: WorkspaceShellOverlayRegistration,
  reference: WorkspaceShellTypedReference | null,
): WorkspaceShellOverlayRequest | null {
  switch (registration.key) {
    case 'library-picker':
      return reference
        ? null
        : { key: 'library-picker', parameters: Object.freeze({}) };
    case 'notifications':
      return reference
        ? null
        : { key: 'notifications', parameters: Object.freeze({}) };
    case 'shell-preview':
      return {
        key: 'shell-preview',
        parameters: { reference },
      };
    case 'workflow-picker':
      return reference
        ? null
        : { key: 'workflow-picker', parameters: Object.freeze({}) };
  }
}

export function resolveWorkspaceShellOverlayRequest(
  registration: WorkspaceShellOverlayRegistration,
  encodedReference: string | null,
  resolveReferenceAccess?: WorkspaceShellOverlayReferenceAccessResolver,
): WorkspaceShellOverlayResolution {
  if (registration.parameterContract.kind === 'none') {
    return encodedReference
      ? { failure: 'invalid_overlay_reference', overlay: null }
      : {
          failure: null,
          overlay: createOverlayRequest(registration, null),
        };
  }

  if (!encodedReference) {
    return {
      failure: null,
      overlay: createOverlayRequest(registration, null),
    };
  }

  const reference = parseOverlayReference(
    encodedReference,
    registration.parameterContract.allowedReferenceKinds,
  );
  if (!reference) {
    return { failure: 'invalid_overlay_reference', overlay: null };
  }

  const access =
    resolveReferenceAccess?.({
      overlayKey: registration.key,
      reference,
    }) ?? 'unauthorized';
  if (access !== 'authorized') {
    return {
      failure:
        access === 'stale'
          ? 'stale_overlay_reference'
          : 'unauthorized_overlay_reference',
      overlay: null,
    };
  }

  return {
    failure: null,
    overlay: createOverlayRequest(registration, reference),
  };
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
  resolveOverlayReferenceAccess,
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
  const isCanonical = !searchParams.has('thread');
  canonicalSearchParams.delete('thread');

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
  const requestedOverlayReference = searchParams.get('overlayRef');
  const overlay = overlayKey
    ? getWorkspaceShellOverlayRegistration(overlayKey)
    : null;

  if (!overlay) {
    if (overlayKey || requestedOverlayReference) {
      canonicalSearchParams.delete('overlay');
      canonicalSearchParams.delete('overlayRef');

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

  const overlayResolution = resolveWorkspaceShellOverlayRequest(
    overlay,
    requestedOverlayReference,
    resolveOverlayReferenceAccess,
  );
  if (overlayResolution.failure || !overlayResolution.overlay) {
    canonicalSearchParams.delete('overlay');
    canonicalSearchParams.delete('overlayRef');

    return {
      canonicalSearchParams,
      isCanonical: false,
      overlay: null,
      restorationFailure:
        overlayResolution.failure ?? 'invalid_overlay_reference',
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
    overlay: overlayResolution.overlay,
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
  if (
    params.overlay?.key === 'shell-preview' &&
    params.overlay.parameters.reference
  ) {
    const { reference } = params.overlay.parameters;
    shellSearchParams.set('overlayRef', `${reference.kind}:${reference.id}`);
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
