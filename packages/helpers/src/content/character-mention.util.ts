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
  const tokens = extractCharacterMentionTokens(params.document);
  const catalogById = new Map(params.catalog.map((item) => [item.id, item]));
  const resolvedIds: string[] = [];
  const notices: string[] = [];
  let text = params.text;

  for (const token of tokens) {
    const displayName = serializeCharacterMentionDisplayName(token);
    if (token.handle) {
      text = text.split(`@${token.handle}`).join(displayName);
    }
    const catalogItem = catalogById.get(token.id);
    if (!catalogItem?.hasReferenceImage || !catalogItem.avatarIngredientId) {
      notices.push(characterMentionMissingReferenceNotice(token));
      continue;
    }
    resolvedIds.push(catalogItem.avatarIngredientId);
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
