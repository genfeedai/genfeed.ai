import { appendSearchParamsToHref } from '@/lib/navigation/operator-shell';
import {
  resolveWorkspaceShellRoute,
  WORKSPACE_SHELL_OVERLAY_REGISTRY,
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
  readonly state: WorkspaceShellState;
  readonly threadId: string | null;
};

type RestoreWorkspaceShellLocationParams = {
  readonly normalizedPathname: string;
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
  searchParams,
}: RestoreWorkspaceShellLocationParams): WorkspaceShellLocation | null {
  const route = resolveWorkspaceShellRoute(normalizedPathname);
  if (!route || route.mode === 'dedicated') {
    return null;
  }

  const canonicalSearchParams = new URLSearchParams(searchParams);
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
      state: route.mode,
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
    ? WORKSPACE_SHELL_OVERLAY_REGISTRY.get(overlayKey)
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
        state: route.mode,
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
      state: route.mode,
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
      state: route.mode,
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
    state: 'overlay',
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
