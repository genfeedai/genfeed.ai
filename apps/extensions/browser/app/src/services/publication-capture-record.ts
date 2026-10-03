import type { ExtensionPublicationCaptureResult } from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import type {
  PublicationCaptureConfirmed,
  PublicationCaptureObservation,
  PublicationCaptureOutboxEntry,
  PublicationCaptureSenderBinding,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import {
  publicationCaptureBody as body,
  publicationCaptureHandle as handle,
  publicationCaptureHomeUrl as home,
  publicationCaptureKeys as keys,
  publicationCaptureNumericId as numeric,
  publicationCaptureRecord as object,
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
  const origin = home(`${v.origin}/home`);
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

export function publicationCaptureEntryFromConfirmed(
  item: PublicationCaptureConfirmed,
): PublicationCaptureOutboxEntry {
  return {
    id: item.attempt.id,
    sourceBinding: item.binding,
    scope: item.attempt.scope,
    input: {
      brandId: item.attempt.scope.brandId,
      platform: 'twitter',
      publicationKind:
        item.attempt.surface.kind === 'x-reply-modal' ? 'reply' : 'post',
      description: item.attempt.description,
      publicationDate: item.observation.publicationDate,
      url: item.observation.url,
      externalId: item.observation.externalId,
      author: { handle: item.attempt.authorHandle },
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
    entry.input.externalId === observation.externalId &&
    entry.input.url === observation.url &&
    entry.input.description === observation.description &&
    entry.input.publicationDate === observation.publicationDate &&
    entry.input.author?.handle === observation.authorHandle
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
      input.platform !== 'twitter' ||
      (input.publicationKind !== 'post' && input.publicationKind !== 'reply') ||
      !text(input.url) ||
      !numeric(input.externalId) ||
      !body(input.description) ||
      !text(input.publicationDate, 64) ||
      !Number.isFinite(Date.parse(input.publicationDate)) ||
      !author ||
      !keys(author, ['handle']) ||
      !handle(author.handle) ||
      input.observedVisibility !== 'unknown' ||
      !validPublicationCaptureIdentity(
        binding.origin,
        String(input.externalId),
        String(input.url),
        String(author.handle),
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
        platform: 'twitter',
        publicationKind: input.publicationKind,
        url: input.url,
        externalId: input.externalId,
        description: input.description,
        publicationDate: input.publicationDate,
        author: { handle: author.handle },
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
