import type {
  PublicationCaptureAttempt,
  PublicationCaptureObservation,
  PublicationCaptureParent,
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
export function publicationCapturePageUrl(value: unknown): URL | null {
  try {
    if (!publicationCaptureText(value)) return null;
    const url = new URL(value);
    return url.protocol === 'https:' &&
      ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(
        url.hostname,
      ) &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}
export function publicationCaptureHomeUrl(value: unknown): URL | null {
  const url = publicationCapturePageUrl(value);
  return url && /^\/home\/?$/.test(url.pathname) ? url : null;
}
export function publicationCaptureComposeUrl(value: unknown): URL | null {
  const url = publicationCapturePageUrl(value);
  return url && /^\/compose\/post\/?$/.test(url.pathname) ? url : null;
}
export function parsePublicationCaptureParent(
  value: unknown,
  origin: string,
): PublicationCaptureParent | null {
  const v = publicationCaptureRecord(value);
  const url = publicationCapturePageUrl(v?.url);
  if (
    !v ||
    !publicationCaptureKeys(v, ['externalId', 'url']) ||
    !publicationCaptureNumericId(v.externalId) ||
    !url ||
    url.origin !== origin ||
    url.search ||
    url.hash ||
    !new RegExp(`^/[a-z0-9_]{1,15}/status/${v.externalId}$`, 'i').test(
      url.pathname,
    )
  )
    return null;
  return { externalId: v.externalId, url: url.href };
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
  return attempt.surface.kind === 'x-home'
    ? Boolean(publicationCaptureHomeUrl(value))
    : Boolean(publicationCaptureComposeUrl(value)) ||
        url.href === attempt.surface.returnUrl;
}
export function validPublicationCaptureIdentity(
  origin: string,
  externalId: string,
  urlValue: string,
  authorHandle: string,
): boolean {
  const url = publicationCapturePageUrl(urlValue);
  return Boolean(
    url &&
      url.origin === origin &&
      !url.search &&
      !url.hash &&
      publicationCaptureNumericId(externalId) &&
      publicationCaptureHandle(authorHandle) &&
      url.pathname.toLowerCase() ===
        `/${authorHandle.toLowerCase()}/status/${externalId}`,
  );
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
  if (
    !publicationCaptureUuid(v.id) ||
    !s ||
    typeof v.startedAt !== 'number' ||
    !Number.isFinite(v.startedAt) ||
    !publicationCapturePageUrl(v.documentUrl) ||
    !publicationCaptureText(v.documentUrl) ||
    !publicationCaptureHandle(v.authorHandle) ||
    !publicationCaptureBody(v.description) ||
    !Array.isArray(v.baselineIds) ||
    v.baselineIds.length > 10000 ||
    !v.baselineIds.every(publicationCaptureNumericId) ||
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
    authorHandle: v.authorHandle.toLowerCase(),
    description: v.description,
    baselineIds: v.baselineIds,
  };
}
export function parsePublicationCaptureObservation(
  value: unknown,
): PublicationCaptureObservation | null {
  const v = publicationCaptureRecord(value);
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
    !publicationCaptureNumericId(v.externalId) ||
    !publicationCaptureText(v.url) ||
    !publicationCaptureHandle(v.authorHandle) ||
    !publicationCaptureBody(v.description) ||
    !publicationCaptureText(v.publicationDate, 64) ||
    !Number.isFinite(Date.parse(v.publicationDate))
  )
    return null;
  return {
    attemptId: v.attemptId,
    externalId: v.externalId,
    url: v.url,
    authorHandle: v.authorHandle.toLowerCase(),
    description: v.description,
    publicationDate: v.publicationDate,
  };
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
      observation.authorHandle === attempt.authorHandle &&
      observation.description === attempt.description &&
      !attempt.baselineIds.includes(observation.externalId) &&
      validPublicationCaptureIdentity(
        source?.origin ?? '',
        observation.externalId,
        observation.url,
        attempt.authorHandle,
      ) &&
      time >= Math.floor(attempt.startedAt / 1000) * 1000 &&
      time <= attempt.startedAt + 60000 &&
      time <= observedAt + 5000
    );
  } catch {
    return false;
  }
}
