import type {
  PersistedConversationComposerAttachment,
  PersistedConversationComposerDraft,
} from '@genfeedai/agent/models/conversation-composer.model';
import type { JSONContent } from '@tiptap/core';

const STORAGE_PREFIX = 'genfeed:conversation-composer:v1';

const EMPTY_DRAFT: PersistedConversationComposerDraft = {
  attachments: [],
  document: null,
  hasFocusIntent: false,
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

function normalizeDraft(
  value: Partial<PersistedConversationComposerDraft>,
): PersistedConversationComposerDraft {
  return {
    attachments: Array.isArray(value.attachments) ? value.attachments : [],
    document:
      value.document && typeof value.document === 'object'
        ? value.document
        : null,
    hasFocusIntent: value.hasFocusIntent === true,
    plainText: typeof value.plainText === 'string' ? value.plainText : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
}

export function readConversationComposerDraft(
  scopeKey: string | null,
): PersistedConversationComposerDraft {
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

export function writeConversationComposerFocusIntent(
  scopeKey: string | null,
  hasFocusIntent: boolean,
): void {
  writeDraft(scopeKey, { hasFocusIntent });
}

export function clearConversationComposerDraft(scopeKey: string | null): void {
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
