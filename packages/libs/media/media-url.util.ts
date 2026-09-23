import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

/**
 * Media URLs are derived, never stored.
 *
 * The object key is the only persisted media identity. Every URL is built
 * from it per read, so changing the CDN host is a config change rather than a
 * data migration, and a URL can carry a short-lived CloudFront signature —
 * which a persisted column never could.
 *
 * These are pure functions shared by the Prisma result extension (which
 * computes `Ingredient.cdnUrl` on every read) and the API `MediaUrlService`.
 */

export interface MediaUrlSigningConfig {
  keyPairId: string;
  privateKey: string;
  ttlSeconds: number;
}

export interface MediaUrlConfig {
  /** CDN origin without a trailing slash, e.g. `https://cdn.genfeed.ai`. */
  cdnUrl: string;
  /** Present only when this deployment signs media URLs. */
  signing?: MediaUrlSigningConfig;
}

export interface MediaUrlOptions {
  /** `false` for objects that are public by design (share pages, OG images). */
  isSignable?: boolean;
}

/** Stored media identity an ingredient URL can be resolved from. */
export interface IngredientMediaSource {
  s3Key?: string | null;
  metadata?: { result?: string | null } | string | null;
}

const STAGING_CDN_ORIGIN = 'https://staging-cdn.genfeed.ai';

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isFilesServiceHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (
    host === 'files.genfeed.ai' ||
    host === 'files.genfeed.localhost' ||
    host.endsWith('.files.genfeed.localhost')
  );
}

/**
 * The files host serves the files API and local-disk driver, not public media;
 * a files-host origin resolves to the public staging CDN instead.
 */
function publicCdnOrigin(cdnOrigin: string): string {
  const trimmed = trimSlash(cdnOrigin);
  try {
    if (isFilesServiceHostname(new URL(trimmed).hostname)) {
      return STAGING_CDN_ORIGIN;
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

function storageKeyFromPath(pathname: string): string | undefined {
  const key = pathname.replace(/^\/+/, '').replace(/^local\//, '');
  return key || undefined;
}

function encodeObjectKey(objectKey: string): string {
  // Encode each segment so `?`, `#` or `%` in a key stay part of the path
  // instead of becoming a query string, fragment or escape.
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function toPublicCdnUrl(value: string, origin: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (isHttpUrl(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const isLocalDiskPath = parsed.pathname.startsWith('/local/');
      if (isFilesServiceHostname(parsed.hostname) || isLocalDiskPath) {
        const key = storageKeyFromPath(parsed.pathname);
        return key ? `${origin}/${key}` : undefined;
      }
      // An absolute URL on any other host is kept verbatim: either this CDN
      // (signed later) or external media that is not ours to rewrite.
      return trimmed;
    } catch {
      return undefined;
    }
  }

  const key = storageKeyFromPath(trimmed);
  return key ? `${origin}/${encodeObjectKey(key)}` : undefined;
}

/**
 * Unsigned public URL for an ingredient, from its stored key or, failing that,
 * its metadata result. Never returns a files-host or `/local/` disk path.
 */
export function resolveIngredientMediaUrl(
  ingredient: IngredientMediaSource,
  cdnOrigin: string,
): string | undefined {
  const origin = publicCdnOrigin(cdnOrigin);

  const fromS3Key = ingredient.s3Key
    ? toPublicCdnUrl(ingredient.s3Key, origin)
    : undefined;
  if (fromS3Key) {
    return fromS3Key;
  }

  const metadata = ingredient.metadata;
  if (metadata && typeof metadata === 'object' && metadata.result) {
    return toPublicCdnUrl(metadata.result, origin);
  }

  return undefined;
}

/**
 * Signs `url` with the configured key pair.
 *
 * A failure never falls back to an unsigned URL — that would hand out exactly
 * the access this prevents. It throws so the caller fails closed.
 */
function sign(url: string, signing: MediaUrlSigningConfig): string {
  const dateLessThan = new Date(
    Date.now() + signing.ttlSeconds * 1000,
  ).toISOString();

  try {
    return getSignedUrl({
      dateLessThan,
      keyPairId: signing.keyPairId,
      privateKey: signing.privateKey,
      url,
    });
  } catch {
    throw new Error('Could not sign the media URL');
  }
}

/** Absolute URL for an encoded path on this CDN, signed when configured. */
function buildFromEncodedPath(
  encodedPath: string,
  config: MediaUrlConfig,
  options: MediaUrlOptions,
): string {
  const url = `${trimSlash(config.cdnUrl)}/${encodedPath}`;
  const isSignable = options.isSignable ?? true;

  if (!isSignable || !config.signing) {
    return url;
  }

  return sign(url, config.signing);
}

/** Absolute, optionally signed URL for a raw object key. */
export function buildMediaUrl(
  objectKey: string,
  config: MediaUrlConfig,
  options: MediaUrlOptions = {},
): string {
  const normalizedKey = objectKey.trim().replace(/^\/+/, '');
  if (!normalizedKey) {
    throw new Error('objectKey is required to build a media URL');
  }

  return buildFromEncodedPath(encodeObjectKey(normalizedKey), config, options);
}

/**
 * Signs an absolute URL on this CDN by recovering its encoded path.
 *
 * Any existing query string is discarded so a stale signature never leaks
 * into the new one. The pathname stays encoded: decoding would turn `%2F`
 * into a separator and select a different object. URLs on any other origin
 * (providers, external media) are returned untouched.
 */
export function signCdnUrl(
  absoluteUrl: string,
  config: MediaUrlConfig,
  options: MediaUrlOptions = {},
): string {
  let parsed: URL;
  let cdnBase: URL;
  try {
    parsed = new URL(absoluteUrl);
    cdnBase = new URL(config.cdnUrl);
  } catch {
    return absoluteUrl;
  }

  if (parsed.origin !== cdnBase.origin) {
    return absoluteUrl;
  }

  const encodedPath = parsed.pathname.replace(/^\/+/, '');
  if (!encodedPath) {
    return absoluteUrl;
  }

  return buildFromEncodedPath(encodedPath, config, options);
}

/**
 * The URL served for an ingredient: resolved from its own stored key and
 * signed when configured. Record-bound by construction — the key is the
 * record's own server-written identity, never a caller-supplied string.
 */
export function ingredientMediaUrl(
  ingredient: IngredientMediaSource,
  config: MediaUrlConfig,
): string | null {
  const resolved = resolveIngredientMediaUrl(ingredient, config.cdnUrl);
  return resolved ? signCdnUrl(resolved, config) : null;
}

/**
 * Fails fast at boot when a key pair is configured but cannot sign.
 *
 * Signing runs inside every ingredient read, and a signing failure throws
 * rather than falling back to an unsigned URL. A bad key would otherwise
 * surface as every media read failing at runtime; this surfaces it once, at
 * startup, with a message that names the cause.
 */
export function assertMediaUrlSigningConfig(config: MediaUrlConfig): void {
  if (!config.signing) {
    return;
  }

  try {
    sign(`${trimSlash(config.cdnUrl)}/signing-probe`, config.signing);
  } catch {
    throw new Error(
      'CDN signing is configured but the key pair cannot sign URLs; check the signing private key and key-pair id',
    );
  }
}
