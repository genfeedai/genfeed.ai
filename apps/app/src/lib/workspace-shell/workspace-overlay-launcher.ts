import type {
  ResolveWorkspaceOverlayLaunchParams,
  WorkspaceOverlayLaunch,
  WorkspaceShellOverlayRequest,
} from '@genfeedai/contracts/interfaces/ui/workspace-shell.interface';
import {
  buildWorkspaceShellHref,
  createOverlayRequest,
} from './workspace-shell-location';
import {
  getWorkspaceShellOverlayRegistration,
  resolveWorkspaceShellRoute,
} from './workspace-shell-registry';

export type {
  ResolveWorkspaceOverlayLaunchParams,
  WorkspaceOverlayLaunch,
} from '@genfeedai/contracts/interfaces/ui/workspace-shell.interface';

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

/**
 * Every registered overlay takes no parameters. A proposed overlay whose
 * `parameters` carries any key is untrusted and fails closed.
 */
function hasValidParameters(overlay: WorkspaceShellOverlayRequest): boolean {
  return (
    Boolean(overlay.parameters) &&
    typeof overlay.parameters === 'object' &&
    !Array.isArray(overlay.parameters) &&
    Object.keys(overlay.parameters).length === 0
  );
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

  if (!hasValidParameters(overlay)) {
    return createUnavailableLaunch(currentUrl);
  }
  const resolvedOverlay = createOverlayRequest(registration);

  const currentOverlayKey = currentUrl.searchParams.get('overlay');
  if (currentOverlayKey === resolvedOverlay.key) {
    return {
      announcement: `${registration.presentation.title} is already open.`,
      history: 'none',
      href: toRelativeHref(currentUrl),
      overlay: resolvedOverlay,
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
      overlay: resolvedOverlay,
    }),
    overlay: resolvedOverlay,
  };
}
