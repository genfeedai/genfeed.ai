function parseUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);

  if (url.hash || url.password || url.search || url.username) {
    throw new Error(
      'Desktop app shell URLs cannot include credentials, search, or hash data.',
    );
  }

  return url;
}

export function resolveBundledAppUrl(rawUrl: string): URL {
  const url = parseUrl(rawUrl);

  if (
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/' ||
    url.protocol !== 'http:'
  ) {
    throw new Error(
      'Bundled desktop app shell URL must be an HTTP 127.0.0.1 loopback origin.',
    );
  }

  return url;
}

export function resolveRemoteAppUrl(authEndpoint: string): URL {
  const url = parseUrl(authEndpoint);

  if (url.protocol !== 'https:') {
    throw new Error('Remote desktop app shell origin must use HTTPS.');
  }

  return new URL(url.origin);
}

export function resolveExternalDevAppUrl(rawUrl: string): URL {
  return resolveBundledAppUrl(rawUrl);
}

export function isTrustedDesktopAppOrigin(rawOrigin: string): boolean {
  try {
    const url = parseUrl(rawOrigin);
    const hasOriginOnlyPath = url.pathname === '/';
    const isLoopback = url.protocol === 'http:' && url.hostname === '127.0.0.1';
    const isRemote = url.protocol === 'https:';

    return hasOriginOnlyPath && (isLoopback || isRemote);
  } catch {
    return false;
  }
}
