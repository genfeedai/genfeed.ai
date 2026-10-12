import type {
  PublicationCaptureAttempt,
  PublicationCaptureObservation,
  PublicationCaptureParent,
  PublicationCapturePlatform,
  PublicationCaptureScope,
  PublicationCaptureSurface,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';

export const PUBLICATION_REPLY_ASSOCIATION_WINDOW_MS = 30_000;
export const PUBLICATION_REPLY_INTENT_LIFETIME_MS = 10 * 60_000;
export function publicationCaptureRecord(
  value: unknown,
): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function publicationCaptureKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
export function publicationCaptureText(
  value: unknown,
  maximum = 2048,
): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= maximum
  );
}
export function publicationCaptureUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function publicationCaptureHandle(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9_]{1,15}$/i.test(value);
}
export function publicationCaptureNumericId(value: unknown): value is string {
  return (
    typeof value === 'string' && /^\d+$/.test(value) && value.length <= 255
  );
}
export function publicationCaptureBody(value: unknown): value is string {
  return (
    publicationCaptureText(value, 1048576) &&
    new TextEncoder().encode(value).length <= 1048576
  );
}
export function parsePublicationCaptureScope(
  value: unknown,
): PublicationCaptureScope | null {
  const v = publicationCaptureRecord(value);
  if (
    !v ||
    !publicationCaptureKeys(v, [
      'userId',
      'organizationId',
      'brandId',
      'revision',
    ]) ||
    !publicationCaptureText(v.userId, 255) ||
    !publicationCaptureText(v.organizationId, 255) ||
    !publicationCaptureText(v.brandId, 255) ||
    typeof v.revision !== 'number' ||
    !Number.isSafeInteger(v.revision) ||
    v.revision < 0
  )
    return null;
  return {
    userId: v.userId,
    organizationId: v.organizationId,
    brandId: v.brandId,
    revision: v.revision,
  };
}
export function samePublicationCaptureScope(
  left: PublicationCaptureScope,
  right: PublicationCaptureScope,
  revision = true,
): boolean {
  return (
    left.userId === right.userId &&
    left.organizationId === right.organizationId &&
    left.brandId === right.brandId &&
    (!revision || left.revision === right.revision)
  );
}
const PLATFORM_HOSTS: Record<PublicationCapturePlatform, readonly string[]> = {
  twitter: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
  linkedin: ['linkedin.com', 'www.linkedin.com'],
};
function supportedPage(
  value: unknown,
): { url: URL; platform: PublicationCapturePlatform } | null {
  try {
    if (!publicationCaptureText(value)) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const platform = (
      Object.keys(PLATFORM_HOSTS) as PublicationCapturePlatform[]
    ).find((name) => PLATFORM_HOSTS[name].includes(url.hostname));
    return platform ? { url, platform } : null;
  } catch {
    return null;
  }
}
export function publicationCapturePlatform(
  value: unknown,
): PublicationCapturePlatform | null {
  return supportedPage(value)?.platform ?? null;
}
export function publicationCapturePageUrl(value: unknown): URL | null {
  return supportedPage(value)?.url ?? null;
}
export function publicationCaptureHomeUrl(value: unknown): URL | null {
  const page = supportedPage(value);
  return page?.platform === 'twitter' && /^\/home\/?$/.test(page.url.pathname)
    ? page.url
    : null;
}
export function publicationCaptureComposeUrl(value: unknown): URL | null {
  const page = supportedPage(value);
  return page?.platform === 'twitter' &&
    /^\/compose\/post\/?$/.test(page.url.pathname)
    ? page.url
    : null;
}
const LINKEDIN_POST_URN = /^urn:li:(?:activity|share|ugcPost):\d{1,32}$/;
const LINKEDIN_COMMENT_URN =
  /^urn:li:comment:\((?:urn:li:)?(activity|share|ugcPost):(\d{1,32}),(\d{1,32})\)$/;
const LINKEDIN_SLUG = /^[a-z0-9%_-]{3,100}$/i;
/** LinkedIn writes the comment URN with or without the inner `urn:li:`; keep one form. */
export function canonicalLinkedInUrn(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (LINKEDIN_POST_URN.test(value)) return value;
  const match = LINKEDIN_COMMENT_URN.exec(value);
  return match ? `urn:li:comment:(${match[1]}:${match[2]},${match[3]})` : null;
}
/** The post URN a canonical post or comment URN belongs to. */
export function linkedInPostUrn(urn: string): string | null {
  if (LINKEDIN_POST_URN.test(urn)) return urn;
  const match = LINKEDIN_COMMENT_URN.exec(urn);
  return match ? `urn:li:${match[1]}:${match[2]}` : null;
}
/** The one permalink form the server parses: the post, plus `commentUrn` for a comment. */
export function linkedInPermalink(origin: string, urn: string): string | null {
  const post = linkedInPostUrn(urn);
  if (!post || publicationCapturePlatform(`${origin}/`) !== 'linkedin')
    return null;
  const url = new URL(`/feed/update/${post}/`, origin);
  if (urn !== post) url.searchParams.set('commentUrn', urn);
  return url.href;
}
export function publicationCaptureLinkedInSlug(
  value: unknown,
): value is string {
  return typeof value === 'string' && LINKEDIN_SLUG.test(value);
}
/** An id the platform shows for a publication: a tweet id on X, a URN on LinkedIn. */
export function publicationCaptureObservedId(
  platform: PublicationCapturePlatform | null,
  value: unknown,
): value is string {
  return platform === 'twitter'
    ? publicationCaptureNumericId(value)
    : platform === 'linkedin' && canonicalLinkedInUrn(value) === value;
}
/** The author the page showed: an X handle, or on LinkedIn a profile slug or none. */
function publicationCaptureAuthor(
  platform: PublicationCapturePlatform | null,
  value: unknown,
): boolean {
  return platform === 'twitter'
    ? publicationCaptureHandle(value)
    : platform === 'linkedin' &&
        (value === null || publicationCaptureLinkedInSlug(value));
}
export function parsePublicationCaptureParent(
  value: unknown,
  origin: string,
): PublicationCaptureParent | null {
  const v = publicationCaptureRecord(value);
  const url = publicationCapturePageUrl(v?.url);
  const platform = publicationCapturePlatform(`${origin}/`);
  if (
    !v ||
    !publicationCaptureKeys(v, ['externalId', 'url']) ||
    !publicationCaptureObservedId(platform, v.externalId) ||
    !url ||
    url.origin !== origin ||
    url.search ||
    url.hash
  )
    return null;
  const path =
    platform === 'linkedin'
      ? `/feed/update/${linkedInPostUrn(v.externalId)}`
      : null;
  return (
    platform === 'twitter'
      ? new RegExp(`^/[a-z0-9_]{1,15}/status/${v.externalId}$`, 'i').test(
          url.pathname,
        )
      : url.pathname.replace(/\/$/, '') === path
  )
    ? { externalId: v.externalId, url: url.href }
    : null;
}
function parseSurface(
  value: unknown,
  documentUrl: string,
  baselineIds: string[],
): PublicationCaptureSurface | null {
  if (value === undefined)
    return publicationCaptureHomeUrl(documentUrl) ? { kind: 'x-home' } : null;
  const v = publicationCaptureRecord(value);
  if (!v) return null;
  if (v.kind === 'linkedin-post' || v.kind === 'linkedin-comment') {
    const source =
      publicationCapturePlatform(documentUrl) === 'linkedin'
        ? publicationCapturePageUrl(documentUrl)
        : null;
    if (!source) return null;
    if (v.kind === 'linkedin-post')
      return publicationCaptureKeys(v, ['kind'])
        ? { kind: 'linkedin-post' }
        : null;
    const parent = parsePublicationCaptureParent(v.parent, source.origin);
    return publicationCaptureKeys(v, ['kind', 'parent']) &&
      parent &&
      baselineIds.includes(parent.externalId)
      ? { kind: 'linkedin-comment', parent }
      : null;
  }
  if (v.kind === 'x-home')
    return publicationCaptureKeys(v, ['kind']) &&
      publicationCaptureHomeUrl(documentUrl)
      ? { kind: 'x-home' }
      : null;
  const source = publicationCaptureComposeUrl(documentUrl);
  if (!source) return null;
  const returnUrl = publicationCapturePageUrl(v.returnUrl);
  if (
    v.returnUrl !== null &&
    (!returnUrl ||
      returnUrl.origin !== source.origin ||
      publicationCaptureComposeUrl(returnUrl.href))
  )
    return null;
  if (
    v.kind === 'x-post-modal' &&
    publicationCaptureKeys(v, ['kind', 'returnUrl']) &&
    (v.returnUrl === null || returnUrl)
  )
    return { kind: 'x-post-modal', returnUrl: returnUrl?.href ?? null };
  const parent = parsePublicationCaptureParent(v.parent, source.origin);
  return v.kind === 'x-reply-modal' &&
    publicationCaptureKeys(v, [
      'kind',
      'returnUrl',
      'replyIntentId',
      'parent',
    ]) &&
    returnUrl &&
    publicationCaptureUuid(v.replyIntentId) &&
    parent &&
    baselineIds.includes(parent.externalId)
    ? {
        kind: 'x-reply-modal',
        returnUrl: returnUrl.href,
        replyIntentId: v.replyIntentId,
        parent,
      }
    : null;
}
export function publicationCaptureAttemptAllowsUrl(
  attempt: PublicationCaptureAttempt,
  value: unknown,
): boolean {
  const url = publicationCapturePageUrl(value);
  const source = publicationCapturePageUrl(attempt.documentUrl);
  if (!url || url.origin !== source?.origin) return false;
  // LinkedIn's composers submit in place: leaving the page abandons the attempt.
  if (
    attempt.surface.kind === 'linkedin-post' ||
    attempt.surface.kind === 'linkedin-comment'
  )
    return (
      url.pathname.replace(/\/$/, '') === source.pathname.replace(/\/$/, '')
    );
  return attempt.surface.kind === 'x-home'
    ? Boolean(publicationCaptureHomeUrl(value))
    : Boolean(publicationCaptureComposeUrl(value)) ||
        url.href === attempt.surface.returnUrl ||
        // A directly opened composer has no origin page; X routes to Home after submit.
        (attempt.surface.kind === 'x-post-modal' &&
          attempt.surface.returnUrl === null &&
          Boolean(publicationCaptureHomeUrl(value)));
}
export function validPublicationCaptureIdentity(
  origin: string,
  externalId: string,
  urlValue: string,
  authorHandle: string | null,
): boolean {
  const url = publicationCapturePageUrl(urlValue);
  const platform = publicationCapturePlatform(urlValue);
  if (
    !url ||
    url.origin !== origin ||
    url.hash ||
    !publicationCaptureObservedId(platform, externalId) ||
    !publicationCaptureAuthor(platform, authorHandle)
  )
    return false;
  return platform === 'linkedin'
    ? url.href === linkedInPermalink(origin, externalId)
    : !url.search &&
        url.pathname.toLowerCase() ===
          `/${String(authorHandle).toLowerCase()}/status/${externalId}`;
}
export function parsePublicationCaptureAttempt(
  value: unknown,
): PublicationCaptureAttempt | null {
  const v = publicationCaptureRecord(value);
  if (
    !v ||
    !publicationCaptureKeys(v, [
      'id',
      'scope',
      'startedAt',
      'documentUrl',
      'authorHandle',
      'description',
      'baselineIds',
      'surface',
    ])
  )
    return null;
  const s = parsePublicationCaptureScope(v.scope);
  const platform = publicationCapturePlatform(v.documentUrl);
  if (
    !publicationCaptureUuid(v.id) ||
    !s ||
    typeof v.startedAt !== 'number' ||
    !Number.isFinite(v.startedAt) ||
    !platform ||
    !publicationCaptureText(v.documentUrl) ||
    // X attempts know their author up front; LinkedIn reads it from the published element.
    (platform === 'twitter'
      ? !publicationCaptureHandle(v.authorHandle)
      : v.authorHandle !== null) ||
    !publicationCaptureBody(v.description) ||
    !Array.isArray(v.baselineIds) ||
    v.baselineIds.length > 10000 ||
    !v.baselineIds.every((id) => publicationCaptureObservedId(platform, id)) ||
    new Set(v.baselineIds).size !== v.baselineIds.length
  )
    return null;
  const surface = parseSurface(v.surface, v.documentUrl, v.baselineIds);
  if (!surface) return null;
  return {
    surface,
    id: v.id,
    scope: s,
    startedAt: v.startedAt,
    documentUrl: v.documentUrl,
    authorHandle:
      platform === 'twitter' ? String(v.authorHandle).toLowerCase() : null,
    description: v.description,
    baselineIds: v.baselineIds,
  };
}
export function parsePublicationCaptureObservation(
  value: unknown,
): PublicationCaptureObservation | null {
  const v = publicationCaptureRecord(value);
  const platform = publicationCapturePlatform(v?.url);
  if (
    !v ||
    !publicationCaptureKeys(v, [
      'attemptId',
      'externalId',
      'url',
      'authorHandle',
      'description',
      'publicationDate',
    ]) ||
    !publicationCaptureUuid(v.attemptId) ||
    !publicationCaptureObservedId(platform, v.externalId) ||
    !publicationCaptureText(v.url) ||
    !publicationCaptureAuthor(platform, v.authorHandle) ||
    !publicationCaptureBody(v.description) ||
    !publicationCaptureText(v.publicationDate, 64) ||
    !Number.isFinite(Date.parse(v.publicationDate))
  )
    return null;
  return {
    attemptId: v.attemptId,
    externalId: v.externalId,
    url: v.url,
    authorHandle:
      typeof v.authorHandle === 'string' ? v.authorHandle.toLowerCase() : null,
    description: v.description,
    publicationDate: v.publicationDate,
  };
}
/** A LinkedIn post attempt may only publish a post; a comment attempt a comment under its parent post. */
function surfaceAllowsObservedId(
  surface: PublicationCaptureSurface,
  externalId: string,
): boolean {
  if (surface.kind === 'linkedin-post')
    return LINKEDIN_POST_URN.test(externalId);
  if (surface.kind === 'linkedin-comment')
    return (
      externalId.startsWith('urn:li:comment:') &&
      linkedInPostUrn(externalId) === linkedInPostUrn(surface.parent.externalId)
    );
  return true;
}
export function validPublicationCaptureObservation(
  attempt: PublicationCaptureAttempt,
  observation: PublicationCaptureObservation,
  observedAt = Date.now(),
): boolean {
  try {
    const source = publicationCapturePageUrl(attempt.documentUrl);
    const time = Date.parse(observation.publicationDate);
    return (
      observation.attemptId === attempt.id &&
      (attempt.authorHandle === null ||
        observation.authorHandle === attempt.authorHandle) &&
      observation.description === attempt.description &&
      !attempt.baselineIds.includes(observation.externalId) &&
      surfaceAllowsObservedId(attempt.surface, observation.externalId) &&
      publicationCapturePlatform(attempt.documentUrl) ===
        publicationCapturePlatform(observation.url) &&
      validPublicationCaptureIdentity(
        source?.origin ?? '',
        observation.externalId,
        observation.url,
        observation.authorHandle,
      ) &&
      time >= Math.floor(attempt.startedAt / 1000) * 1000 &&
      time <= attempt.startedAt + 60000 &&
      time <= observedAt + 5000
    );
  } catch {
    return false;
  }
}
