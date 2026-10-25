export const CHARACTERS_CHANGED_EVENT = 'genfeed:characters:changed';

export interface CharacterMentionToken {
  handle: string;
  id: string;
  label: string;
}

export interface CharacterMentionCatalogEntry {
  avatarIngredientId?: string | null;
  handle: string;
  hasReferenceImage: boolean;
  id: string;
  label: string;
  /** Ordered reference images; sent to generation in this order. */
  referenceIngredientIds?: readonly string[];
}

export interface CharacterMentionDocumentNode {
  attrs?: {
    handle?: unknown;
    id?: unknown;
    label?: unknown;
  };
  content?: CharacterMentionDocumentNode[];
  type?: string;
}

export interface ResolvedCharacterReference {
  handle: string;
  id: string;
  label: string;
  notice?: string;
  referenceId?: string;
}

export interface CharacterMentionSubmitInput {
  catalog: readonly CharacterMentionCatalogEntry[];
  document: unknown;
  existingReferenceIds: readonly string[];
  text: string;
}

export interface CharacterMentionSubmitResult {
  notices: string[];
  referenceIds: string[];
  text: string;
}

export function serializeCharacterMentionDisplayName(
  token: CharacterMentionToken,
): string {
  return token.label?.trim() || token.handle;
}

export function characterMentionMissingReferenceNotice(
  token: CharacterMentionToken,
): string {
  const name = serializeCharacterMentionDisplayName(token);
  return `${name} has no canonical reference image and was omitted from references.`;
}

export function extractCharacterMentionTokens(
  document: unknown,
): CharacterMentionToken[] {
  const tokens: CharacterMentionToken[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') {
      return;
    }

    const record = node as CharacterMentionDocumentNode;
    if (record.type === 'characterMention') {
      const id = typeof record.attrs?.id === 'string' ? record.attrs.id : '';
      const handle =
        typeof record.attrs?.handle === 'string' ? record.attrs.handle : '';
      const label =
        typeof record.attrs?.label === 'string' ? record.attrs.label : '';
      if (id) {
        tokens.push({ handle, id, label });
      }
    }

    if (Array.isArray(record.content)) {
      for (const child of record.content) {
        walk(child);
      }
    }
  }

  walk(document);
  return tokens;
}

const TYPED_MENTION_PATTERN = /@([\p{L}\p{N}_.-]+)/gu;

/** `@vincent.` ends a sentence; the handle is `vincent`. */
function trimTypedHandle(raw: string): string {
  return raw.replace(/[.-]+$/u, '');
}

/**
 * A `@handle` typed out in the prompt instead of picked from the popup. Only
 * a handle that is in the catalog counts, matched without case, and a
 * character already present as a chip is not repeated.
 */
export function findTypedCharacterMentions(
  text: string,
  catalog: readonly CharacterMentionCatalogEntry[],
  existing: readonly CharacterMentionToken[] = [],
): CharacterMentionToken[] {
  const byHandle = new Map(
    catalog
      .filter((item) => item.handle)
      .map((item) => [item.handle.toLowerCase(), item]),
  );
  const seen = new Set(existing.map((token) => token.id));
  const typed: CharacterMentionToken[] = [];
  for (const match of text.matchAll(TYPED_MENTION_PATTERN)) {
    const item = byHandle.get(trimTypedHandle(match[1]).toLowerCase());
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    typed.push({ handle: item.handle, id: item.id, label: item.label });
  }
  return typed;
}

function replaceTypedHandle(text: string, token: CharacterMentionToken) {
  const displayName = serializeCharacterMentionDisplayName(token);
  return text.replace(TYPED_MENTION_PATTERN, (full, raw: string) => {
    const handle = trimTypedHandle(raw);
    return handle.toLowerCase() === token.handle.toLowerCase()
      ? `${displayName}${raw.slice(handle.length)}`
      : full;
  });
}

export function dedupeCharacterReferenceIds(
  existing: readonly string[],
  resolved: readonly string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of [...existing, ...resolved]) {
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

export function applyCharacterMentionsToSubmit(
  params: CharacterMentionSubmitInput,
): CharacterMentionSubmitResult {
  const chipTokens = extractCharacterMentionTokens(params.document);
  const typedTokens = findTypedCharacterMentions(
    params.text,
    params.catalog,
    chipTokens,
  );
  const tokens = [...chipTokens, ...typedTokens];
  const catalogById = new Map(params.catalog.map((item) => [item.id, item]));
  const resolvedIds: string[] = [];
  const notices: string[] = [];
  let text = params.text;

  for (const token of tokens) {
    const displayName = serializeCharacterMentionDisplayName(token);
    if (typedTokens.includes(token)) {
      text = replaceTypedHandle(text, token);
    } else if (token.handle) {
      text = text.split(`@${token.handle}`).join(displayName);
    }
    const catalogItem = catalogById.get(token.id);
    // Every reference in priority order; the model's reference limit caps
    // the merged list downstream. Older catalogs only carry the primary.
    const referenceIds = catalogItem?.referenceIngredientIds?.length
      ? catalogItem.referenceIngredientIds
      : catalogItem?.avatarIngredientId
        ? [catalogItem.avatarIngredientId]
        : [];
    if (!catalogItem?.hasReferenceImage || referenceIds.length === 0) {
      notices.push(characterMentionMissingReferenceNotice(token));
      continue;
    }
    resolvedIds.push(...referenceIds);
  }

  return {
    notices,
    referenceIds: dedupeCharacterReferenceIds(
      params.existingReferenceIds,
      resolvedIds,
    ),
    text,
  };
}
