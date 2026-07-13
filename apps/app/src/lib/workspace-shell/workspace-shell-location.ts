import type {
  RestoreWorkspaceShellLocationParams,
  WorkspaceShellLocation,
  WorkspaceShellOverlayReferenceAccessResolver,
  WorkspaceShellOverlayRegistration,
  WorkspaceShellOverlayRequest,
  WorkspaceShellOverlayResolution,
  WorkspaceShellReferenceKind,
  WorkspaceShellTypedReference,
} from '@genfeedai/interfaces/ui/workspace-shell.interface';
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
} from '@genfeedai/interfaces/ui/workspace-shell.interface';

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

function extractConversationThreadId(pathname: string): string | null {
  const match = /^\/agent\/([^/]+)$/.exec(pathname);
  const candidate = match?.[1] ?? null;

  return isSafeOpaqueId(candidate) && candidate !== 'new' ? candidate : null;
}

export function restoreWorkspaceShellLocation({
  normalizedPathname,
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
  const requestedThreadId = searchParams.get('thread');
  const threadId =
    route.mode === 'conversation'
      ? extractConversationThreadId(normalizedPathname)
      : isSafeOpaqueId(requestedThreadId)
        ? requestedThreadId
        : null;

  if (
    route.mode === 'conversation' &&
    /^\/agent\/[^/]+$/.test(normalizedPathname) &&
    normalizedPathname !== '/agent/new' &&
    !threadId
  ) {
    canonicalSearchParams.delete('thread');

    return {
      baseState: route.mode,
      canonicalSearchParams,
      isCanonical: false,
      overlay: null,
      restorationFailure: 'invalid_thread',
      routeKey: route.key,
      safeFallbackHref,
      state: route.mode,
      surfaceKey: route.surfaceKey,
      threadId: null,
    };
  }

  let isCanonical = true;
  if (route.mode === 'conversation' && searchParams.has('thread')) {
    canonicalSearchParams.delete('thread');
    isCanonical = false;
  } else if (
    route.mode === 'canvas' &&
    searchParams.has('thread') &&
    !threadId
  ) {
    canonicalSearchParams.delete('thread');
    isCanonical = false;
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
        baseState: route.mode,
        canonicalSearchParams,
        isCanonical: false,
        overlay: null,
        restorationFailure: 'invalid_overlay',
        routeKey: route.key,
        safeFallbackHref,
        state: route.mode,
        surfaceKey: route.surfaceKey,
        threadId,
      };
    }

    return {
      baseState: route.mode,
      canonicalSearchParams,
      isCanonical,
      overlay: null,
      restorationFailure: null,
      routeKey: route.key,
      safeFallbackHref,
      state: route.mode,
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
      baseState: route.mode,
      canonicalSearchParams,
      isCanonical: false,
      overlay: null,
      restorationFailure:
        overlayResolution.failure ?? 'invalid_overlay_reference',
      routeKey: route.key,
      safeFallbackHref,
      state: route.mode,
      surfaceKey: route.surfaceKey,
      threadId,
    };
  }

  return {
    baseState: route.mode,
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
    readonly threadId?: string | null;
  },
): string {
  const shellSearchParams = new URLSearchParams();

  if (params.threadId) {
    shellSearchParams.set('thread', params.threadId);
  }
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

  return appendSearchParamsToHref(pathname, nextSearchParams);
}
