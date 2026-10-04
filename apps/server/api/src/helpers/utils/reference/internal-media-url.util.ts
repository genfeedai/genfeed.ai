const MEDIA_SEGMENTS = new Set([
  'avatars',
  'audios',
  'images',
  'musics',
  'thumbnails',
  'videos',
  'voices',
]);

export interface InternalMediaUrlClassification {
  /** The asset id the URL points at, when it can be resolved. */
  assetId?: string;
  /** True when the URL's host is one of the internal media hosts. */
  isInternal: boolean;
}

/** Lower-cased hosts of the configured internal media origins. */
export function internalMediaHosts(
  origins: ReadonlyArray<string | undefined>,
): Set<string> {
  const hosts = new Set<string>();
  for (const origin of origins) {
    const host = origin ? parseUrl(origin)?.hostname : undefined;
    if (host) {
      hosts.add(normalizeHost(host));
    }
  }
  return hosts;
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value.trim());
  } catch {
    return undefined;
  }
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, '');
}

function decodePath(pathname: string): string | undefined {
  try {
    // Decode twice so a double-encoded segment cannot hide the media path.
    return decodeURIComponent(decodeURIComponent(pathname));
  } catch {
    return undefined;
  }
}

/**
 * The one place that decides whether a URL points at internal media and which
 * asset it names (#6037). The host is compared case-insensitively and without
 * a trailing dot against every configured internal media host; the path is
 * decoded and its duplicate slashes collapsed; query and fragment are
 * ignored. Any URL on an internal host is internal, and when its asset id
 * cannot be resolved the caller must fail closed.
 *
 * A host-less `/images/<id>` path is a canonical internal URL too.
 */
export function classifyInternalMediaUrl(
  value: string,
  hosts: ReadonlySet<string>,
): InternalMediaUrlClassification {
  const trimmed = value.trim();
  const parsed = parseUrl(trimmed);
  const isRelative = !parsed && trimmed.startsWith('/');
  if (!parsed && !isRelative) {
    return { isInternal: false };
  }
  const isOnInternalHost = parsed
    ? hosts.has(normalizeHost(parsed.hostname))
    : true;
  if (!isOnInternalHost && hosts.size > 0) {
    return { isInternal: false };
  }
  const rawPath = parsed ? parsed.pathname : (trimmed.split(/[?#]/)[0] ?? '');
  const path = decodePath(rawPath)?.replace(/\/{2,}/g, '/');
  const segments = path?.split('/').filter(Boolean) ?? [];
  // `ingredients/images/<id>` and `images/<id>` both name the asset.
  const mediaIndex = segments.findIndex((segment) =>
    MEDIA_SEGMENTS.has(segment.toLowerCase()),
  );
  const assetId = mediaIndex >= 0 ? segments[mediaIndex + 1] : undefined;
  if (assetId) {
    return { assetId, isInternal: true };
  }
  // With no configured host only a recognizable media path counts; with one,
  // anything on an internal host is internal and must resolve or fail closed.
  return { isInternal: isOnInternalHost && hosts.size > 0 };
}
