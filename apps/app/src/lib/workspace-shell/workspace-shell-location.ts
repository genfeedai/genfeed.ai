import { appendSearchParamsToHref } from '@/lib/navigation/operator-shell';
import {
  getWorkspaceShellOverlayRegistration,
  resolveWorkspaceShellRoute,
  resolveWorkspaceShellSafeFallback,
  type WorkspaceShellBaseState,
  type WorkspaceShellReferenceKind,
} from './workspace-shell-registry';

export const WORKSPACE_SHELL_QUERY_KEYS = [
  'overlay',
  'overlayRef',
  'thread',
] as const;

export type WorkspaceShellState = WorkspaceShellBaseState | 'overlay';

export type WorkspaceShellTypedReference = {
  readonly id: string;
  readonly kind: WorkspaceShellReferenceKind;
};

export type WorkspaceShellRestorationFailure =
  | 'invalid_overlay'
  | 'invalid_overlay_reference'
  | 'invalid_thread';

export type WorkspaceShellLocation = {
  readonly baseState: WorkspaceShellBaseState;
  readonly canonicalSearchParams: URLSearchParams;
  readonly isCanonical: boolean;
  readonly overlayKey: string | null;
  readonly overlayReference: WorkspaceShellTypedReference | null;
  readonly restorationFailure: WorkspaceShellRestorationFailure | null;
  readonly routeKey: string;
  readonly safeFallbackHref: string;
  readonly state: WorkspaceShellState;
  readonly surfaceKey: string;
  readonly threadId: string | null;
};

type RestoreWorkspaceShellLocationParams = {
  readonly normalizedPathname: string;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
};

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

function extractConversationThreadId(pathname: string): string | null {
  const match = /^\/agent\/([^/]+)$/.exec(pathname);
  const candidate = match?.[1] ?? null;

  return isSafeOpaqueId(candidate) && candidate !== 'new' ? candidate : null;
}

export function restoreWorkspaceShellLocation({
  normalizedPathname,
  pathname,
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
      overlayKey: null,
      overlayReference: null,
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
        overlayKey: null,
        overlayReference: null,
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
      overlayKey: null,
      overlayReference: null,
      restorationFailure: null,
      routeKey: route.key,
      safeFallbackHref,
      state: route.mode,
      surfaceKey: route.surfaceKey,
      threadId,
    };
  }

  const overlayReference = parseOverlayReference(
    requestedOverlayReference,
    overlay.allowedReferenceKinds,
  );
  if (requestedOverlayReference && !overlayReference) {
    canonicalSearchParams.delete('overlay');
    canonicalSearchParams.delete('overlayRef');

    return {
      baseState: route.mode,
      canonicalSearchParams,
      isCanonical: false,
      overlayKey: null,
      overlayReference: null,
      restorationFailure: 'invalid_overlay_reference',
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
    overlayKey: overlay.key,
    overlayReference,
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
    readonly overlayKey?: string;
    readonly overlayReference?: WorkspaceShellTypedReference;
    readonly threadId?: string | null;
  },
): string {
  const shellSearchParams = new URLSearchParams();

  if (params.threadId) {
    shellSearchParams.set('thread', params.threadId);
  }
  if (params.overlayKey) {
    shellSearchParams.set('overlay', params.overlayKey);
  }
  if (params.overlayReference) {
    shellSearchParams.set(
      'overlayRef',
      `${params.overlayReference.kind}:${params.overlayReference.id}`,
    );
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
