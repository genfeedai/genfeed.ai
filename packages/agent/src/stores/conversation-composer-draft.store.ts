import type {
  PersistedConversationComposerAttachment,
  PersistedConversationComposerContentReference,
  PersistedConversationComposerDraft,
} from '@genfeedai/agent/models/conversation-composer.model';
import type { JSONContent } from '@tiptap/core';

const pendingDocuments = new Map<
  string,
  {
    document: () => JSONContent;
    plainText: string;
    timer: ReturnType<typeof setTimeout>;
  }
>();

const STORAGE_PREFIX = 'genfeed:conversation-composer:v1';

/**
 * Dispatched on `window` whenever a scope's draft content references change
 * outside the composer that owns it (e.g. a Library "Add to conversation"
 * action while the dock composer is mounted). `detail.scopeKey` identifies
 * which draft changed so a listener can ignore updates to other scopes.
 */
export const CONVERSATION_COMPOSER_DRAFT_UPDATED_EVENT =
  'genfeed:conversation-composer:draft-updated';

const EMPTY_DRAFT: PersistedConversationComposerDraft = {
  attachments: [],
  contentReferences: [],
  document: null,
  plainText: '',
  updatedAt: '',
};

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getStorageKey(scopeKey: string): string {
  return `${STORAGE_PREFIX}:${scopeKey}`;
}

function normalizeContentReference(
  value: unknown,
): PersistedConversationComposerContentReference | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.contentTitle !== 'string' ||
    typeof record.contentType !== 'string'
  ) {
    return null;
  }

  return {
    ...(typeof record.brandId === 'string' && record.brandId
      ? { brandId: record.brandId }
      : record.brandId === null
        ? { brandId: null }
        : {}),
    contentTitle: record.contentTitle,
    contentType: record.contentType,
    id: record.id,
    // Missing on a legacy record (written before `kind` existed) means `post`.
    ...(record.kind === 'ingredient' || record.kind === 'post'
      ? { kind: record.kind }
      : {}),
    ...(typeof record.thumbnailUrl === 'string'
      ? { thumbnailUrl: record.thumbnailUrl }
      : {}),
  };
}

function normalizeDraft(
  value: Partial<PersistedConversationComposerDraft>,
): PersistedConversationComposerDraft {
  const contentReferences = Array.isArray(value.contentReferences)
    ? value.contentReferences
        .map((item) => normalizeContentReference(item))
        .filter(
          (item): item is PersistedConversationComposerContentReference =>
            item !== null,
        )
    : [];

  return {
    attachments: Array.isArray(value.attachments) ? value.attachments : [],
    contentReferences,
    document:
      value.document && typeof value.document === 'object'
        ? value.document
        : null,
    plainText: typeof value.plainText === 'string' ? value.plainText : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
}

export function readConversationComposerDraft(
  scopeKey: string | null,
): PersistedConversationComposerDraft {
  flushConversationComposerDocument(scopeKey);
  const storage = getStorage();
  if (!scopeKey || !storage) {
    return EMPTY_DRAFT;
  }

  try {
    const raw = storage.getItem(getStorageKey(scopeKey));
    if (raw) {
      return normalizeDraft(
        JSON.parse(raw) as Partial<PersistedConversationComposerDraft>,
      );
    }

    const versionSeparatorIndex = scopeKey.lastIndexOf(':');
    if (versionSeparatorIndex <= 0) {
      return EMPTY_DRAFT;
    }

    const scopePrefix = `${STORAGE_PREFIX}:${scopeKey.slice(
      0,
      versionSeparatorIndex + 1,
    )}`;
    let latestDraft: PersistedConversationComposerDraft | null = null;
    for (let index = 0; index < storage.length; index += 1) {
      const candidateKey = storage.key(index);
      if (!candidateKey?.startsWith(scopePrefix)) {
        continue;
      }

      const candidateRaw = storage.getItem(candidateKey);
      if (!candidateRaw) {
        continue;
      }

      const candidate = normalizeDraft(
        JSON.parse(candidateRaw) as Partial<PersistedConversationComposerDraft>,
      );
      if (
        !latestDraft ||
        candidate.updatedAt.localeCompare(latestDraft.updatedAt) > 0
      ) {
        latestDraft = candidate;
      }
    }

    return latestDraft ?? EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

function writeDraft(
  scopeKey: string | null,
  update: Partial<PersistedConversationComposerDraft>,
): void {
  const storage = getStorage();
  if (!scopeKey || !storage) {
    return;
  }

  try {
    const next = {
      ...readConversationComposerDraft(scopeKey),
      ...update,
      updatedAt: new Date().toISOString(),
    };
    storage.setItem(getStorageKey(scopeKey), JSON.stringify(next));
  } catch {
    // Draft persistence is best-effort; the live editor remains authoritative.
  }
}

/** Keep serialization and storage off the keystroke path. */
export function scheduleConversationComposerDocument(
  scopeKey: string | null,
  document: () => JSONContent,
  plainText: string,
): void {
  if (!scopeKey) return;
  const previous = pendingDocuments.get(scopeKey);
  if (previous) clearTimeout(previous.timer);
  pendingDocuments.set(scopeKey, {
    document,
    plainText,
    timer: setTimeout(() => flushConversationComposerDocument(scopeKey), 250),
  });
}

export function flushConversationComposerDocument(
  scopeKey: string | null,
): void {
  if (!scopeKey) return;
  const pending = pendingDocuments.get(scopeKey);
  if (!pending) return;
  pendingDocuments.delete(scopeKey);
  clearTimeout(pending.timer);
  writeConversationComposerDocument(
    scopeKey,
    pending.document(),
    pending.plainText,
  );
}

export function writeConversationComposerDocument(
  scopeKey: string | null,
  document: JSONContent,
  plainText: string,
): void {
  writeDraft(scopeKey, { document, plainText });
}

export function writeConversationComposerAttachments(
  scopeKey: string | null,
  attachments: PersistedConversationComposerAttachment[],
): void {
  writeDraft(scopeKey, { attachments });
}

export function writeConversationComposerContentReferences(
  scopeKey: string | null,
  contentReferences: PersistedConversationComposerContentReference[],
): void {
  writeDraft(scopeKey, { contentReferences });
}

export function clearConversationComposerDraft(scopeKey: string | null): void {
  if (scopeKey) {
    const pending = pendingDocuments.get(scopeKey);
    if (pending) clearTimeout(pending.timer);
    pendingDocuments.delete(scopeKey);
  }
  const storage = getStorage();
  if (!scopeKey || !storage) {
    return;
  }

  try {
    storage.setItem(
      getStorageKey(scopeKey),
      JSON.stringify({ ...EMPTY_DRAFT, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // The sent message still succeeds when storage is unavailable.
  }
}

/** The composer draft scope the workspace shell binds to a conversation. */
export function buildConversationComposerDraftScopeKey(
  orgSlug: string,
  threadId: string | null,
  contextVersion = 0,
): string {
  return `${orgSlug || 'unknown'}:${threadId ?? 'new'}:${contextVersion}`;
}

/**
 * Appends a content reference to a scope's draft (deduped by id) and notifies
 * any composer currently mounted on that scope via
 * `CONVERSATION_COMPOSER_DRAFT_UPDATED_EVENT`, so a record attached from
 * elsewhere in the app (e.g. Library) shows up in a live composer without a
 * remount.
 */
export function attachContentToConversationDraft(
  scopeKey: string | null,
  reference: PersistedConversationComposerContentReference,
): void {
  const { contentReferences } = readConversationComposerDraft(scopeKey);
  if (contentReferences.some((item) => item.id === reference.id)) {
    return;
  }

  writeConversationComposerContentReferences(scopeKey, [
    ...contentReferences,
    reference,
  ]);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(CONVERSATION_COMPOSER_DRAFT_UPDATED_EVENT, {
        detail: { scopeKey },
      }),
    );
  }
}

/**
 * Puts a Library item on the attachment tray of the organization's next new
 * conversation, so a page can hand an asset to the Agent without sending a
 * message on the user's behalf.
 */
export function attachContentToNewConversationDraft(
  orgSlug: string,
  reference: PersistedConversationComposerContentReference,
): void {
  attachContentToConversationDraft(
    buildConversationComposerDraftScopeKey(orgSlug, null),
    reference,
  );
}

// Chips a composer dismissed for the next message. Held per scope in memory so
// they survive the composer remounting (an overlay taking the prompt bar, the
// dock sheet closing) until the next send in that scope.
const dismissedSurfaceReferenceKeysByScope = new Map<
  string,
  ReadonlySet<string>
>();
const EMPTY_DISMISSED_KEYS: ReadonlySet<string> = new Set();

export function readDismissedSurfaceReferenceKeys(
  scopeKey: string | null,
): ReadonlySet<string> {
  return scopeKey
    ? (dismissedSurfaceReferenceKeysByScope.get(scopeKey) ??
        EMPTY_DISMISSED_KEYS)
    : EMPTY_DISMISSED_KEYS;
}

export function writeDismissedSurfaceReferenceKeys(
  scopeKey: string | null,
  keys: ReadonlySet<string>,
): void {
  if (!scopeKey) {
    return;
  }

  if (keys.size === 0) {
    dismissedSurfaceReferenceKeysByScope.delete(scopeKey);
  } else {
    dismissedSurfaceReferenceKeysByScope.set(scopeKey, keys);
  }
}
