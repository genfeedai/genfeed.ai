import { useMemo, useSyncExternalStore } from 'react';
import type { OAuthCallbackLocation } from '@/features/auth/props/oauth-platform-form.props';

const OAUTH_PATH_PREFIX = '/oauth/';

function subscribeToLocation(): () => void {
  // The callback URL never changes while the page is mounted.
  return () => undefined;
}

function getLocationSnapshot(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function getServerLocationSnapshot(): null {
  return null;
}

/** Splits `/oauth/<platform>?<query>` into the decoded platform and the query. */
export function parseOAuthCallbackLocation(
  location: string,
): { platform: string; query: string } | null {
  const queryStart = location.indexOf('?');
  const pathname = queryStart === -1 ? location : location.slice(0, queryStart);
  const query = queryStart === -1 ? '' : location.slice(queryStart + 1);

  if (!pathname.startsWith(OAUTH_PATH_PREFIX)) {
    return null;
  }

  const segment = pathname.slice(OAUTH_PATH_PREFIX.length).split('/')[0];
  if (!segment) {
    return null;
  }

  try {
    return { platform: decodeURIComponent(segment), query };
  } catch {
    return { platform: segment, query };
  }
}

/**
 * Reads the OAuth callback URL on the client. Returns `null` during the server
 * render and the hydration pass, so the page can render a static pending shell
 * instead of reading request data through a streamed Suspense boundary.
 */
export function useOAuthCallbackLocation(): OAuthCallbackLocation | null {
  const location = useSyncExternalStore(
    subscribeToLocation,
    getLocationSnapshot,
    getServerLocationSnapshot,
  );

  return useMemo(() => {
    if (location === null) {
      return null;
    }
    const parsed = parseOAuthCallbackLocation(location);
    if (!parsed) {
      return null;
    }

    return {
      platform: parsed.platform,
      searchParams: new URLSearchParams(parsed.query),
    };
  }, [location]);
}
