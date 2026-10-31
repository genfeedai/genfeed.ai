import type {
  PublicationCaptureAttempt,
  PublicationCaptureReplyIntent,
  PublicationCaptureReplyIntentInput,
  PublicationCaptureScope,
  PublicationCaptureSenderBinding,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import {
  parsePublicationCaptureSenderBinding,
  samePublicationCaptureSenderBinding,
} from '~services/publication-capture-record';
import {
  publicationCaptureComposeUrl as compose,
  publicationCaptureHandle as handle,
  publicationCaptureKeys as keys,
  publicationCaptureRecord as object,
  PUBLICATION_REPLY_INTENT_LIFETIME_MS,
  publicationCapturePageUrl as page,
  parsePublicationCaptureParent,
  parsePublicationCaptureScope,
  samePublicationCaptureScope as same,
  publicationCaptureUuid as uuid,
} from '~services/publication-capture-validation';
export const PUBLICATION_REPLY_INTENTS_KEY =
  'genfeed-publication-reply-intents-v1';
function parseInput(
  value: unknown,
  binding: PublicationCaptureSenderBinding,
): PublicationCaptureReplyIntentInput | null {
  const v = object(value);
  const scope = parsePublicationCaptureScope(v?.scope);
  const url = page(v?.documentUrl);
  const parent = parsePublicationCaptureParent(v?.parent, binding.origin);
  if (
    !v ||
    !keys(v, ['scope', 'createdAt', 'documentUrl', 'authorHandle', 'parent']) ||
    !scope ||
    !url ||
    url.origin !== binding.origin ||
    compose(url.href) ||
    !parent ||
    !handle(v.authorHandle) ||
    typeof v.createdAt !== 'number' ||
    !Number.isFinite(v.createdAt)
  )
    return null;
  return {
    scope,
    createdAt: v.createdAt,
    documentUrl: url.href,
    authorHandle: v.authorHandle.toLowerCase(),
    parent,
  };
}
export async function readPublicationReplyIntents(): Promise<
  Record<string, PublicationCaptureReplyIntent>
> {
  const stored = await chrome.storage.session.get(
    PUBLICATION_REPLY_INTENTS_KEY,
  );
  if (stored[PUBLICATION_REPLY_INTENTS_KEY] === undefined) return {};
  const raw = object(stored[PUBLICATION_REPLY_INTENTS_KEY]);
  if (!raw)
    throw new Error(
      'Could not read publication recordings. Existing storage has been preserved.',
    );
  const entries: Record<string, PublicationCaptureReplyIntent> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = object(value);
    const binding = parsePublicationCaptureSenderBinding(v?.binding);
    const input = binding ? parseInput(v?.input, binding) : null;
    if (
      !v ||
      !keys(v, ['id', 'binding', 'input']) ||
      !uuid(v.id) ||
      !/^\d+$/.test(key) ||
      !binding ||
      binding.tabId !== Number(key) ||
      !input
    )
      throw new Error(
        'Could not read publication recordings. Existing storage has been preserved.',
      );
    entries[key] = { id: v.id, binding, input };
  }
  return entries;
}
export function createPublicationReplyIntent(
  value: unknown,
  binding: PublicationCaptureSenderBinding,
  scope: PublicationCaptureScope,
  now: number,
): PublicationCaptureReplyIntent | null {
  const input = parseInput(value, binding);
  if (
    !input ||
    !same(input.scope, scope) ||
    input.createdAt < now - 5000 ||
    input.createdAt > now + 1000
  )
    return null;
  return { id: crypto.randomUUID(), binding, input };
}
export function matchesPublicationReplyIntent(
  intent: PublicationCaptureReplyIntent,
  attempt: PublicationCaptureAttempt,
  binding: PublicationCaptureSenderBinding,
  now: number,
): boolean {
  const surface = attempt.surface;
  return (
    surface.kind === 'x-reply-modal' &&
    surface.replyIntentId === intent.id &&
    samePublicationCaptureSenderBinding(intent.binding, binding) &&
    same(intent.input.scope, attempt.scope) &&
    intent.input.authorHandle === attempt.authorHandle &&
    surface.returnUrl === intent.input.documentUrl &&
    surface.parent.externalId === intent.input.parent.externalId &&
    surface.parent.url === intent.input.parent.url &&
    now >= intent.input.createdAt &&
    now <= intent.input.createdAt + PUBLICATION_REPLY_INTENT_LIFETIME_MS &&
    attempt.startedAt >= intent.input.createdAt
  );
}
