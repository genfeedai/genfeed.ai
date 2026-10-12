import type { ExtensionPublicationCaptureResult } from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import type {
  PublicationCaptureConfirmed,
  PublicationCaptureObservation,
  PublicationCaptureOutboxEntry,
  PublicationCapturePlatform,
  PublicationCaptureSenderBinding,
  PublicationCaptureSurface,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import {
  publicationCaptureBody as body,
  canonicalLinkedInUrn,
  publicationCaptureKeys as keys,
  publicationCaptureRecord as object,
  publicationCaptureObservedId as observedId,
  publicationCapturePageUrl as page,
  publicationCapturePlatform as platformOf,
  parsePublicationCaptureScope as scope,
  publicationCaptureText as text,
  publicationCaptureUuid as uuid,
  validPublicationCaptureIdentity,
} from '~services/publication-capture-validation';
export function parsePublicationCaptureSenderBinding(
  value: unknown,
): PublicationCaptureSenderBinding | null {
  const v = object(value);
  if (
    !v ||
    !keys(v, ['tabId', 'origin']) ||
    typeof v.tabId !== 'number' ||
    !Number.isSafeInteger(v.tabId) ||
    v.tabId < 0 ||
    !text(v.origin)
  )
    return null;
  const origin = page(`${v.origin}/`);
  if (!origin || origin.origin !== v.origin) return null;
  return { tabId: v.tabId, origin: v.origin };
}
export function samePublicationCaptureSenderBinding(
  left: PublicationCaptureSenderBinding,
  right: PublicationCaptureSenderBinding,
): boolean {
  return left.tabId === right.tabId && left.origin === right.origin;
}
export function samePublicationCaptureObservation(
  left: PublicationCaptureObservation,
  right: PublicationCaptureObservation,
): boolean {
  return (
    left.attemptId === right.attemptId &&
    left.externalId === right.externalId &&
    left.url === right.url &&
    left.authorHandle === right.authorHandle &&
    left.description === right.description &&
    left.publicationDate === right.publicationDate
  );
}

export function publicationCaptureSurfaceKind(
  surface: PublicationCaptureSurface,
): 'post' | 'reply' {
  return surface.kind === 'x-reply-modal' || surface.kind === 'linkedin-comment'
    ? 'reply'
    : 'post';
}
/**
 * The provider identity sent as `externalId`. X posts and replies carry the tweet id; a
 * LinkedIn post carries it only when its permalink URN is already a share/UGC URN, and
 * otherwise (activity URN, or any comment) is recorded by URL alone.
 */
export function publicationCaptureProviderId(
  platform: PublicationCapturePlatform,
  kind: 'post' | 'reply',
  observedExternalId: string,
): string | undefined {
  if (platform === 'twitter') return observedExternalId;
  return kind === 'post' &&
    /^urn:li:(?:share|ugcPost):\d+$/.test(observedExternalId)
    ? observedExternalId
    : undefined;
}
export function publicationCaptureEntryFromConfirmed(
  item: PublicationCaptureConfirmed,
): PublicationCaptureOutboxEntry {
  const platform = platformOf(item.observation.url);
  if (!platform) throw new Error('Unsupported publication platform.');
  const publicationKind = publicationCaptureSurfaceKind(item.attempt.surface);
  const externalId = publicationCaptureProviderId(
    platform,
    publicationKind,
    item.observation.externalId,
  );
  const handle = item.observation.authorHandle;
  return {
    id: item.attempt.id,
    sourceBinding: item.binding,
    scope: item.attempt.scope,
    input: {
      brandId: item.attempt.scope.brandId,
      platform,
      publicationKind,
      description: item.attempt.description,
      publicationDate: item.observation.publicationDate,
      url: item.observation.url,
      ...(externalId ? { externalId } : {}),
      ...(handle ? { author: { handle } } : {}),
      observedVisibility: 'unknown',
    },
    createdAt: item.observedAt,
    status: 'queued',
  };
}
export function publicationCaptureEntryMatches(
  entry: PublicationCaptureOutboxEntry,
  observation: PublicationCaptureObservation,
): boolean {
  return (
    entry.id === observation.attemptId &&
    // The url carries the observed id, so equal urls are the same publication.
    entry.input.url === observation.url &&
    entry.input.description === observation.description &&
    entry.input.publicationDate === observation.publicationDate &&
    (entry.input.author?.handle ?? null) === observation.authorHandle
  );
}

/** The id the page showed, recovered from a stored input: X keeps it, LinkedIn keeps it in the permalink. */
function storedObservedId(
  platform: PublicationCapturePlatform,
  input: Record<string, unknown>,
): unknown {
  if (platform === 'twitter') return input.externalId;
  const url = page(input.url);
  const post =
    /^\/feed\/update\/(urn:li:(?:activity|share|ugcPost):\d+)\/?$/.exec(
      url?.pathname ?? '',
    );
  const comment = url?.searchParams.get('commentUrn');
  return post && (comment === null || comment === undefined)
    ? post[1]
    : canonicalLinkedInUrn(comment);
}
function storedIdentity(
  platform: PublicationCapturePlatform,
  kind: 'post' | 'reply',
  origin: string,
  input: Record<string, unknown>,
  authorHandle: unknown,
): boolean {
  const observed = storedObservedId(platform, input);
  if (!observedId(platform, observed) || typeof input.url !== 'string')
    return false;
  return (
    input.externalId ===
      publicationCaptureProviderId(platform, kind, observed) &&
    (platform === 'twitter' ||
      (kind === 'reply') === observed.startsWith('urn:li:comment:')) &&
    validPublicationCaptureIdentity(
      origin,
      observed,
      input.url,
      typeof authorHandle === 'string' ? authorHandle : null,
    )
  );
}
export function parsePublicationCaptureOutbox(
  value: unknown,
  inFlightIds: ReadonlySet<string>,
): PublicationCaptureOutboxEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new Error(
      'Could not read publication recordings. Existing storage has been preserved.',
    );
  const entries: PublicationCaptureOutboxEntry[] = [];
  for (const item of value) {
    const v = object(item);
    const binding = parsePublicationCaptureSenderBinding(v?.sourceBinding);
    const s = scope(v?.scope);
    const input = object(v?.input);
    const author = object(input?.author);
    const platform = platformOf(input?.url);
    if (
      !v ||
      !keys(v, [
        'id',
        'scope',
        'input',
        'createdAt',
        'status',
        'error',
        'sourceBinding',
      ]) ||
      !binding ||
      !uuid(v.id) ||
      !s ||
      !input ||
      !keys(input, [
        'brandId',
        'platform',
        'publicationKind',
        'url',
        'externalId',
        'description',
        'publicationDate',
        'author',
        'observedVisibility',
      ]) ||
      input.brandId !== s.brandId ||
      !platform ||
      input.platform !== platform ||
      platformOf(`${binding.origin}/`) !== platform ||
      (input.publicationKind !== 'post' && input.publicationKind !== 'reply') ||
      !text(input.url) ||
      !body(input.description) ||
      !text(input.publicationDate, 64) ||
      !Number.isFinite(Date.parse(input.publicationDate)) ||
      (input.author !== undefined &&
        (!author || !keys(author, ['handle']) || !text(author.handle, 255))) ||
      input.observedVisibility !== 'unknown' ||
      !storedIdentity(
        platform,
        input.publicationKind,
        binding.origin,
        input,
        author?.handle,
      ) ||
      typeof v.createdAt !== 'number' ||
      !Number.isFinite(v.createdAt) ||
      !['queued', 'recording', 'failed'].includes(String(v.status)) ||
      (v.error !== undefined && !text(v.error, 512)) ||
      entries.some((entry) => entry.id === v.id)
    )
      throw new Error(
        'Could not read publication recordings. Existing storage has been preserved.',
      );
    const status =
      v.status === 'recording' && !inFlightIds.has(v.id) ? 'queued' : v.status;
    if (status !== 'queued' && status !== 'recording' && status !== 'failed')
      throw new Error('Invalid recording storage.');
    entries.push({
      id: v.id,
      sourceBinding: binding,
      scope: s,
      input: {
        brandId: s.brandId,
        platform,
        publicationKind: input.publicationKind,
        url: input.url,
        ...(typeof input.externalId === 'string'
          ? { externalId: input.externalId }
          : {}),
        description: input.description,
        publicationDate: input.publicationDate,
        ...(typeof author?.handle === 'string'
          ? { author: { handle: author.handle } }
          : {}),
        observedVisibility: 'unknown',
      },
      createdAt: v.createdAt,
      status,
      ...(typeof v.error === 'string' ? { error: v.error } : {}),
    });
  }
  return entries;
}

export function parsePublicationCaptureResult(
  value: unknown,
): ExtensionPublicationCaptureResult | null {
  const v = object(value);
  if (
    !v ||
    !text(v.postId, 255) ||
    typeof v.created !== 'boolean' ||
    !['permalink', 'context-only', 'unavailable'].includes(String(v.urlKind)) ||
    ![
      'eligible',
      'missing-external-id',
      'missing-credential',
      'unsupported-platform',
      'unsupported-publication-kind',
      'provider-id-unresolved',
    ].includes(String(v.analyticsAvailability)) ||
    !['public', 'private', 'unlisted', 'unknown'].includes(
      String(v.observedVisibility),
    )
  )
    return null;
  for (const key of [
    'source',
    'externalId',
    'url',
    'contextUrl',
    'credentialId',
  ])
    if (v[key] !== null && typeof v[key] !== 'string') return null;
  const identity = object(v.urlIdentity);
  if (
    v.urlIdentity !== null &&
    (!identity ||
      ![
        'instagram-shortcode',
        'linkedin-activity',
        'facebook-post-token',
        'platform-publication-id',
      ].includes(String(identity.kind)) ||
      !text(identity.value))
  )
    return null;
  // Every API field has been structurally validated; retain the original source on replay.
  return v as unknown as ExtensionPublicationCaptureResult;
}
