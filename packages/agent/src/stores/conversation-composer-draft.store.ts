import type {
  PersistedConversationComposerAttachment,
  PersistedConversationComposerContentReference,
  PersistedConversationComposerDraft,
} from '@genfeedai/agent/models/conversation-composer.model';
import type { JSONContent } from '@tiptap/core';

const STORAGE_PREFIX = 'genfeed:conversation-composer:v1';

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
    contentTitle: record.contentTitle,
    contentType: record.contentType,
    id: record.id,
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

export function writeConversationComposerContentReferences(
  scopeKey: string | null,
  contentReferences: PersistedConversationComposerContentReference[],
): void {
  writeDraft(scopeKey, { contentReferences });
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
