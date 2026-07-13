import type {
  ResolveWorkspaceOverlayLaunchParams,
  WorkspaceOverlayLaunch,
  WorkspaceShellOverlayRequest,
} from '@genfeedai/interfaces/ui/workspace-shell.interface';
import {
  buildWorkspaceShellHref,
  resolveWorkspaceShellOverlayRequest,
} from './workspace-shell-location';
import {
  getWorkspaceShellOverlayRegistration,
  resolveWorkspaceShellRoute,
} from './workspace-shell-registry';

export type {
  ResolveWorkspaceOverlayLaunchParams,
  WorkspaceOverlayLaunch,
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

function createUnavailableLaunch(
  currentUrl: URL | null,
  announcement = 'Overlay unavailable.',
): WorkspaceOverlayLaunch {
  return {
    announcement,
    history: 'none',
    href: currentUrl ? toRelativeHref(currentUrl) : '/',
    overlay: null,
  };
}

function encodeOverlayReference(
  overlay: WorkspaceShellOverlayRequest,
  registration: NonNullable<
    ReturnType<typeof getWorkspaceShellOverlayRegistration>
  >,
): string | null | undefined {
  if (
    !overlay.parameters ||
    typeof overlay.parameters !== 'object' ||
    Array.isArray(overlay.parameters)
  ) {
    return undefined;
  }

  if (registration.parameterContract.kind === 'none') {
    return Object.keys(overlay.parameters).length === 0 ? null : undefined;
  }

  if (
    Object.keys(overlay.parameters).some((key) => key !== 'reference') ||
    !Object.hasOwn(overlay.parameters, 'reference')
  ) {
    return undefined;
  }

  const { reference } = overlay.parameters;
  if (reference === null) {
    return null;
  }
  if (
    !reference ||
    typeof reference !== 'object' ||
    typeof reference.id !== 'string' ||
    typeof reference.kind !== 'string'
  ) {
    return undefined;
  }

  return `${reference.kind}:${reference.id}`;
}

/**
 * Resolves an overlay transition through the trusted application registry.
 * Model output can propose a key, but only an explicit user invocation may
 * mutate history. Replacing an existing overlay uses one history entry so a
 * nested dialog stack can never form.
 */
export function resolveWorkspaceOverlayLaunch({
  currentHref,
  invocation,
  overlay,
  resolveOverlayReferenceAccess,
}: ResolveWorkspaceOverlayLaunchParams): WorkspaceOverlayLaunch {
  const currentUrl = parseInternalHref(currentHref);
  if (!currentUrl) {
    return createUnavailableLaunch(null);
  }
  if (invocation !== 'user') {
    return createUnavailableLaunch(
      currentUrl,
      'Overlay proposal requires an explicit user action.',
    );
  }

  const currentRoute = resolveWorkspaceShellRoute(currentUrl.pathname);
  if (!currentRoute || currentRoute.mode === 'dedicated') {
    return createUnavailableLaunch(currentUrl);
  }

  const runtimeKey = (overlay as { readonly key?: unknown }).key;
  if (typeof runtimeKey !== 'string') {
    return createUnavailableLaunch(currentUrl);
  }
  const registration = getWorkspaceShellOverlayRegistration(runtimeKey);
  if (!registration) {
    return createUnavailableLaunch(currentUrl);
  }

  const encodedReference = encodeOverlayReference(overlay, registration);
  if (encodedReference === undefined) {
    return createUnavailableLaunch(currentUrl);
  }
  const resolution = resolveWorkspaceShellOverlayRequest(
    registration,
    encodedReference,
    resolveOverlayReferenceAccess,
  );
  if (resolution.failure || !resolution.overlay) {
    return createUnavailableLaunch(currentUrl);
  }

  const currentOverlayKey = currentUrl.searchParams.get('overlay');
  const currentOverlayReference = currentUrl.searchParams.get('overlayRef');
  if (
    currentOverlayKey === resolution.overlay.key &&
    currentOverlayReference === encodedReference
  ) {
    return {
      announcement: `${registration.presentation.title} is already open.`,
      history: 'none',
      href: toRelativeHref(currentUrl),
      overlay: resolution.overlay,
    };
  }

  const isReplacingOverlay = Boolean(
    currentOverlayKey || currentUrl.searchParams.has('overlayRef'),
  );
  currentUrl.searchParams.delete('overlay');
  currentUrl.searchParams.delete('overlayRef');

  return {
    announcement: registration.presentation.openAnnouncement,
    history: isReplacingOverlay ? 'replace' : 'push',
    href: buildWorkspaceShellHref(toRelativeHref(currentUrl), {
      overlay: resolution.overlay,
    }),
    overlay: resolution.overlay,
  };
}
